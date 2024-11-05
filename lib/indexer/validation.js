const bcash = require('bcash');
const { Address, Script, script, KeyRing } = bcash;
const { SLP } = script;
const bio = require('bufio');
const { U64 } = require('n64');
const { Hash160 } = require('bcrypto');


module.exports = function validateIssueTx(tx) {
	const buffer = Buffer.from(tx.outputs[0].script.toRaw(), 'hex');
	const br = bio.read(buffer);
	let offset = 0;

	// is there an OP_RETURN?
	const opReturnCodeBuf = br.readBytes(1);
	offset += 1;
	const opReturnCode = opReturnCodeBuf.toString('hex');
	const hasOpReturn = opReturnCode === "6a"
	if (!hasOpReturn) {
		console.error("Invalid OP_RETURN")
		return false;
	};

	// validate byte length code
	const lengthCodeBuf = br.readBytes(1);
	offset += 1;
	const lengthCode = lengthCodeBuf.toString('hex');
	let bufferLengthByteLength;
	let isValidByteLengthCode = false;
	if (lengthCode === "4c") {
		bufferLengthByteLength = 1;
		isValidByteLengthCode = true;
	} else if (lengthCode === "4d") {
		bufferLengthByteLength = 2;
		isValidByteLengthCode = true;
	} 
	if (!isValidByteLengthCode) {
		console.error("Invalid byte length code")
		return false;
	}

	// validate byte length
	let totalBufLength;
	if (bufferLengthByteLength === 1) {
		totalBufLength = br.readU8();
		offset += 1;
	} else {
		totalBufLength = br.readU16();
		offset += 2;
	}

	const opReturnBufSize = buffer.length;
	const hasValidByteLength = opReturnBufSize === offset + totalBufLength;
	if (!hasValidByteLength) {
		console.error("Invalid byte length")
		return false;
	}
	const serialization = br.readBytes(totalBufLength);
	console.log("serializqation", serialization.toString('hex'));
	const validSerialization = validateSerialization(serialization);
	if (!validSerialization) {
		return false;
	}

	// get input pubkey
	const pubkey = getInputPubkey(tx.inputs[0].script);
	const keyring = KeyRing.fromPublic(pubkey);

	// validate p2sh address
	const outScript = schrodingerOutscript(keyring.publicKey);
	const outScriptHash = Hash160.digest(outScript.raw)
	const pubKeyScript = Script.fromScripthash(outScriptHash);
	const address = pubKeyScript.getAddress();
	const givenP2SHAddress = tx.outputs[1].getAddress();
	const isValidOutscript = address.toString() === givenP2SHAddress.toString();
	if (!isValidOutscript) {
		console.log("Invalid Outscript");
		return false;
	}

	// validate msg+authsig

	return { 
		addresses: validSerialization.addresses,
	}
}

function validateSerialization(buffer) {
	try {
		const br = bio.read(buffer);
		let offset = 0;

		// validate vout0 OP_RETURN
		// get vout0 amount
		const vout0AmountBE = br.readBytes(8);
		offset += 8;
		const vout0Amount = U64.fromBE(vout0AmountBE);
		const vout0ScriptLength = br.readU8();
		// console.log("vout0ScriptLength", vout0ScriptLength);
		offset += 1; 
		const vout0ScriptBuf = br.readBytes(vout0ScriptLength);
		offset += vout0ScriptLength;
		const vout0Script = vout0ScriptBuf.toString('hex')
		// console.log("vout0Script", vout0Script)
		const redeemOpReturn = new SLP(vout0ScriptBuf);
		const isValidSlpScript = redeemOpReturn.isValidSlp();
		if (!isValidSlpScript) {
			console.error("Invalid SLP script")
			return false;
		}
		const tokenIdBuf = redeemOpReturn.getTokenId();
		// console.log("tokenIdBuf", tokenIdBuf);
		const tokenId = tokenIdBuf.toString('hex');
		// console.log("tokenId", tokenId);
		const mintOutputsBuf = redeemOpReturn.code.slice(5);
		// console.log("mintoutputsbuf", mintOutputsBuf)
		const mintOutputs = parseMintOutputs(mintOutputsBuf);
		// console.log("mintOutputs", mintOutputs);
		const numberOfExpectedOutputs = mintOutputs.length; 
		// console.log("numberofexpectedoutputs", numberOfExpectedOutputs);
		const recipientOutputs = [];
		for (let i=0; i < numberOfExpectedOutputs; i++) {
			// console.log("for loop i", i)
			const amountBuf = br.readBytes(8);
			offset += 8;
			const amount = U64.fromLE(amountBuf).toNumber();
			// console.log("amount", amount)
			const scriptLength  = br.readU8();
			// console.log("scriptLength", scriptLength);
			offset += 1;
			const scriptBuf = br.readBytes(scriptLength);
			// console.log("scriptBuf", scriptBuf);
			offset += scriptLength;
			// const vout1ScriptString = vout1ScriptBuf.toString('hex');
			// console.log("vout1ScriptString", vout1ScriptString)
			const script = new Script(scriptBuf);
			// console.log("script", script);    
			const address = Address.fromScript(script);            
			// console.log("address", address);
			recipientOutputs.push({
				amountBuf, 
				amount, 
				script, 
				address
			})
		}
		// console.log("recipientOutputs", recipientOutputs);	

		// validate raised bits
		const raisedBitsBuf = br.readBytes(4);
		offset += 4;
		const raisedBits = raisedBitsBuf.toString('hex')

		// validate player numbers
		const playerNumbersBuf = br.readBytes(4);
		console.log("playerNumbersBuf", playerNumbersBuf);
		offset += 4;
		const hasValidPlayerNumbers = validatePlayerNumbers(playerNumbersBuf);
		if (!hasValidPlayerNumbers) {
			console.error("Invalid player numbers");
			return false;
		}	

		// validate auth sig 
		const authSigLength = buffer.length - offset;
		// console.log("authSigLength", authSigLength)
		const authSigBuf = br.readBytes(authSigLength);
		// console.log("authSigBuf", authSigBuf);
		const authSig = authSigBuf.toString('hex')
		// console.log("parsed authSig", authSig);	

		const authSigSerialization = buffer.slice(0,buffer.length-authSigLength);

		return {
			authSigSerialization, 
			authSigBuf,
			addresses: recipientOutputs
		}
	} catch(err) {
		console.error("validateSerialization error");
		return false;
	}
}
function parseMintOutputs(outputs) {
	// console.log("outputs.length", outputs.length)
	let parsedMintOutputs = [];
	for (let i = 0; i < outputs.length; i++) {
		const op = outputs[i];
		if (op.data.length != 8) {
			// console.error("INVALID OUTPUT LENGTH IN REDEEM OUTPUTS VOUT0 SCRIPT")
			return false;
		}
		const tokenAmountBuf = op.data;
		const tokenAmount = U64.fromBE(tokenAmountBuf);
		parsedMintOutputs.push({
			tokenAmount, 
			tokenAmountBuf
		});
	}

	return parsedMintOutputs;
}  
function validatePlayerNumbers(buffer) {
	for (let i = 0; i < buffer.length; i++) {
		const pOffset = 3 - i
		const playerByte = buffer.slice(pOffset, pOffset + 1)
		const number = playerByte.readUInt8();
		// console.log("number", number);
		const isNumberInRange = number > 0 && number < 128;
		// console.log("isNumberInRange", isNumberInRange);
		if (!isNumberInRange) {
			return false;
		}
	}

	return true;
}
function getInputPubkey(script) {
	const br = bio.read(script.toRaw());
	const sigLength = br.readU8();
	const sig = br.readBytes(sigLength);
	const pubkeyLength = br.readU8();
	const pubkey = br.readBytes(pubkeyLength);

	return pubkey;
}	
function schrodingerOutscript(authPubKey) {

	const script = new Script()

		.pushSym('3dup')
		.pushSym('hash256')
		.pushSym('dup')
		.pushSym('rot')
		.pushSym('hash256')
		.pushSym('cat')
		.pushInt(6)
		.pushSym('roll')
		.pushSym('over')
		.pushData(authPubKey)
		.pushSym('dup')
		.pushSym('toaltstack')
		.pushSym('checkdatasigverify') // Verify tx+block signature
		.pushSym('hash256') // Random number

		// Begin dissecting preimage
		.pushSym('rot')
		.pushInt(4)
		.pushSym('split')
		.pushSym('nip')
		.pushInt(32)
		.pushSym('split')
		.pushInt(3)
		.pushSym('roll')
		.pushData(Buffer.from('01000000', 'hex'))
		.pushSym('cat')
		.pushSym('hash256')
		.pushSym('rot')
		.pushSym('equalverify') // Validate single input is from index 0 of ttx outputs
		.pushSym('size')
		.pushInt(40)
		.pushSym('sub')
		.pushSym('split')
		.pushSym('nip')
		.pushInt(32)
		.pushSym('split')
		.pushSym('drop') // Output hash

		// Begin dissecting ttx
		.pushSym('rot')
		.pushInt(5)
		.pushSym('split')
		.pushSym('nip')
		.pushInt(36)
		.pushSym('split')
		.pushInt(1)
		.pushSym('split')
		.pushSym('swap')
		.pushSym('split')
		.pushSym('nip')
		.pushInt(13)
		.pushSym('split')
		.pushSym('nip')
		.pushInt(1)
		.pushSym('split')
		.pushSym('swap')
		.pushData(Buffer.from('00', 'hex'))
		.pushSym('cat')
		.pushSym('split')
		.pushSym('drop')
		.pushInt(3)
		.pushSym('split')
		.pushSym('nip')
		.pushInt(147)
		.pushSym('split')
		.pushSym('rot')
		.pushInt(2)
		.pushSym('pick')
		.pushSym('cat')
		.pushSym('fromaltstack')
		.pushSym('checkdatasigverify')
		.pushInt(139)
		.pushSym('split')
		.pushInt(4)
		.pushSym('split')

		// Begin random number modification
		.pushInt(3)
		.pushSym('split')
		.pushSym('swap')
		.pushInt(2)
		.pushSym('split')
		.pushSym('swap')
		.pushInt(1)
		.pushSym('split')
		.pushInt(7)
		.pushSym('roll')

		// Modulo calculate and sum that solves for signs
		.pushInt(31)
		.pushSym('split')
		.pushSym('rot')
		.pushSym('cat')
		.pushInt(16)
		.pushSym('mod')
		.pushSym('swap')

		.pushInt(30)
		.pushSym('split')
		.pushInt(3)
		.pushSym('roll')
		.pushSym('cat')
		.pushInt(16)
		.pushSym('mod')
		.pushSym('swap')

		.pushInt(29)
		.pushSym('split')
		.pushInt(4)
		.pushSym('roll')
		.pushSym('cat')
		.pushInt(16)
		.pushSym('mod')
		.pushSym('swap')

		.pushInt(28)
		.pushSym('split')
		.pushSym('nip')
		.pushInt(4)
		.pushSym('roll')
		.pushSym('cat')
		.pushInt(16)
		.pushSym('mod')

		.pushSym('add')
		.pushSym('add')
		.pushSym('add')

		// // Original modulo calculate and sum
		// .pushInt(2)
		// .pushSym('split')
		// .pushSym('toaltstack')
		// .pushSym('add')
		// .pushSym('abs')
		// .pushInt(16)
		// .pushSym('mod')
		// .pushSym('swap')
		// .pushSym('fromaltstack')

		// .pushInt(2)
		// .pushSym('split')
		// .pushSym('toaltstack')
		// .pushSym('add')
		// .pushSym('abs')
		// .pushInt(16)
		// .pushSym('mod')
		// .pushSym('add')
		// .pushSym('swap')
		// .pushSym('fromaltstack')

		// .pushInt(2)
		// .pushSym('split')
		// .pushSym('toaltstack')
		// .pushSym('add')
		// .pushSym('abs')
		// .pushInt(16)
		// .pushSym('mod')
		// .pushSym('add')
		// .pushSym('swap')
		// .pushSym('fromaltstack')

		// .pushInt(2)
		// .pushSym('split')
		// .pushSym('drop')
		// .pushSym('add')
		// .pushSym('abs')
		// .pushInt(16)
		// .pushSym('mod')
		// .pushSym('add') //

		.pushSym('rot')
		.pushInt(73)
		.pushSym('split')
		.pushSym('swap')
		.pushInt(65)
		.pushSym('split')
		.pushSym('reversebytes')
		.pushSym('bin2num')
		.pushInt(3)
		.pushSym('roll')
		.pushSym('tuck')

	// Payout Calculation
	paytable = [1, 5, 7, 12]

	for (let i = 0; i < paytable.length; i++) {

		script.pushInt(paytable[i])
			.pushSym('greaterthanorequal')
			.pushSym('if')
			.pushInt(2)
			.pushSym('div')
			.pushSym('endif')
		// Do OP_OVER unless final and then do OP_SWAP
		if (i === paytable.length - 1) {
			script.pushSym('swap')
		} else {
			script.pushSym('over')
		}
	}

	script.pushInt(36)
		.pushSym('greaterthanorequal')
		.pushSym('if')
		.pushSym('drop')
		.pushData(Buffer.from('00', 'hex'))
		.pushSym('endif')

		.pushInt(8)
		.pushSym('num2bin')
		.pushSym('reversebytes')
		.pushSym('rot')
		.pushSym('cat')
		.pushSym('cat')
		.pushSym('hash256')
		.pushSym('rot')
		.pushSym('equalverify')
		.pushInt(3)
		.pushSym('split')
		.pushSym('dup')
		.pushInt(32)
		.pushSym('swap')
		.pushSym('sub')
		.pushData(Buffer.from('00', 'hex'))
		.pushSym('swap')
		.pushSym('num2bin')
		.pushInt(3)
		.pushSym('roll')
		.pushSym('hash256')
		.pushSym('rot')
		.pushSym('split')
		.pushSym('rot')
		.pushSym('equalverify')
		.pushSym('size')
		.pushInt(3)
		.pushSym('sub')
		.pushSym('split')
		.pushSym('nip')
		.pushData(Buffer.from('00', 'hex'))
		.pushSym('cat')
		.pushSym('bin2num')
		.pushSym('swap')
		.pushData(Buffer.from('00', 'hex'))
		.pushSym('cat')
		.pushSym('bin2num')
		.pushSym('lessthanorequal')
		.pushSym('verify')

	// Begin preimage validation
	// Anyone can spend
	.pushSym('sha256')
	.pushSym('3dup')
	.pushSym('rot')
	.pushSym('size')
	.pushSym('1sub')
	.pushSym('split')
	.pushSym('drop')
	.pushSym('swap')
	.pushSym('rot')
	.pushSym('checkdatasigverify')
	
	.pushSym('drop')
	.pushSym('checksig');
	
	// compile and return
	return script.compile();

}
