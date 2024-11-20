const bcash = require('bcash');
const { Address, 
	Script, 
	script, 
	KeyRing,
	Output, 
	Outpoint, 
	Coin

} = bcash;
const { SHA256 } = require('bcrypto');
const bio = require('bufio');


const authpubkeys = [
	"023ad0f8ca0f6aa26e276e790a8a5c5983bfa544261369fc4495326284b23b7c48"
];

/** 
 * validate issue tx in two steps:
 * check that vout1 goes to correct address
 * check that authsig in OP_RETURN is signed with correct public key
 *  * */  
module.exports = function validateIssueTx(tx) {

	// validate p2sh address
	let auth;
	const vout1Address = tx.outputs[1]?.address;
	if (!vout1Address) 
		return false;
	
	const isScriptHash = vout1Address.isScripthash();
	if (!isScriptHash) 
		return false;

	for (const pubkeyString of authpubkeys) {
		const pubkey = Buffer.from(pubkeyString, 'hex');
		const outscript = schrodingerOutscript(pubkey);		
		const outScriptHash = outscript.hash160();
		const address = Address.fromScripthash(outScriptHash);
		const isValidOutscript = address.toString() === vout1Address.toString();
		if (isValidOutscript) 
			auth = KeyRing.fromPublic(pubkey);
	}
	
	if (!auth)
		return false;
	
	// validate authsig in op_return
	const coin = Coin.fromJSON(tx.inputs[0].coin);
	const outpoint =  Outpoint.fromOptions(coin);
	const outpointBuf = outpoint.toRaw();
	const buffer = Buffer.from(tx.outputs[0].script, 'hex');
	const opReturn = new Script(buffer);
	const authCodeBuf = opReturn.get(1).data;
	const { txAuthSig, raisedBits, minterNumbers, txSerializedOutputs, txOutputs } = readTicketAuthCode(authCodeBuf);
	const msg = Buffer.concat([outpointBuf, txSerializedOutputs, raisedBits, minterNumbers])
	const msgHash = SHA256.digest(msg);
	const verified = auth.verify(msgHash, txAuthSig);
	
	if (!verified)
		false;

	const addresses = txOutputs.map(output => output.getAddress())
		.filter(address => address !== null);

	return addresses;
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

function readTicketAuthCode(authCodeBuf) {

    const authReader = bio.read(authCodeBuf);
    const txSerializedOutputs = authReader.readBytes(139);
    const raisedBits = authReader.readBytes(4);
    const minterNumbers = authReader.readBytes(4);
    const txAuthSig = authReader.readBytes(authReader.getSize() - authReader.offset);

    const outputsReader = read(txSerializedOutputs);
    const txOutputs = [];
    while (outputsReader.getSize() > outputsReader.offset) {
        txOutputs.push(Output.fromReader(outputsReader))
    }

    return {
        // tokenId,
        txAuthSig,
        raisedBits,
        minterNumbers,
        txSerializedOutputs,
        txOutputs,
    }
}