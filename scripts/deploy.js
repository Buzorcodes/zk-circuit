const { ethers } = require("ethers");
const { utils } = require("ffjavascript");
const fs = require("fs");
const snarkjs = require("snarkjs");
const hardhat = require("hardhat");

const BASE_PATH = "./circuits/zkcircuit/";

function p256(n) {
  
  let hexaDecimal = n.toString(16);
  while (hexaDecimal.length < 64) hexaDecimal = "0" + hexaDecimal;
  hexaDecimal = "0x" + hexaDecimal;
  return ethers.BigNumber.from(hexaDecimal);
}

async function generateCallData() {

  const zkProof = await generateProof();
  const proof = utils.unstringifyBigInts(zkProof.proof);
  const pub = utils.unstringifyBigInts(zkProof.publicSignals);

  let inputs = "";
   for (let i = 0; i < pub.length; i++) {
    if (inputs) inputs += ",";
    inputs += p256(pub[i]);
  }

  const pi_a = [p256(proof.pi_a[0]), p256(proof.pi_a[1])];
  const pi_b = [
    [p256(proof.pi_b[0][1]), p256(proof.pi_b[0][0])],
    [p256(proof.pi_b[1][1]), p256(proof.pi_b[1][0])],
  ];
  const pi_c = [p256(proof.pi_c[0]), p256(proof.pi_c[1])];
  const input = [inputs];

  return { pi_a, pi_b, pi_c, input };
}

async function generateProof() {

  const inputData = fs.readFileSync(BASE_PATH + "input.json", "utf8");
  const input = JSON.parse(inputData);

 
  const out = await snarkjs.wtns.calculate(
    input,
    BASE_PATH + "out/circuit.wasm",
    BASE_PATH + "out/circuit.wtns"
  );

  // Generate the proof using the circuit witness and proving key
  const proof = await snarkjs.groth16.prove(
    BASE_PATH + "out/circuit.zkey",
    BASE_PATH + "out/circuit.wtns"
  );

  // Write the generated proof to a file
  fs.writeFileSync(BASE_PATH + "out/proof.json", JSON.stringify(proof, null, 1));

  return proof;
}

async function main() {
  // Deploy the ZkVerifier contract
  const ZkVerifier = await hardhat.ethers.getContractFactory(
    "./contracts/ZkVerifier.sol:ZkVerifier"
  );
  const zkverifier = await ZkVerifier.deploy();
  await zkverifier.deployed();
  console.log(`ZkVerifier deployed to ${zkverifier.address}`);

  // Generate the call data
  const { pi_a, pi_b, pi_c, input } = await generateCallData();

  // Verify the proof using the ZkVerifier contract
  const tx = await zkverifier.verifyProof(pi_a, pi_b, pi_c, input);
  console.log(`ZkVerifier result: ${tx}`);
  console.assert(tx == true, "Proof verification failed!");

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});