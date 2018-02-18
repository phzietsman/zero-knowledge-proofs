const {spawn} = require('child_process')
var events = require('events');
var eventEmitter = new events.EventEmitter();

var singleProofGenerator
var proofCodeBlocking = false
var singleProofGeneratorIsRunning = false

function getMatches(string, regex) {
  var matches = [];
  var match;
  while (match = regex.exec(string)) {
    matches.push(match[0]);
  }
  return matches;
}

function getProofCodeBlocking(){
  return proofCodeBlocking
}

function setProofCodeBlocking(value){
  proofCodeBlocking=value
}

function shutDown(){
  singleProofGenerator.stdin.write('q\n')
}

function generateProof(paymentId){
    singleProofGenerator.stdin.write(paymentId + '\n')
}

function handleExecuteProgram(programName, args, msgStart, msgEnd, msgError, cb){
//  console.log(msgStart)

  var succesfullyCompleted=true
  const runCommand = spawn(programName, args)

  runCommand.stdout.on('data', (data) => {
    dataString = data.toString()

    if(data.indexOf('(leave) Call to r1cs_ppzksnark_online_verifier_strong_IC')>-1){
      var matches = getMatches(dataString, /verifier_strong_IC.\[[0-9]{0,2}.[0-9]*s/g)
      var noSecs = ''  
      if(matches && matches.length>0){
        noSecs = matches[0].substring(20,matches[0].length)
      } else {
  //      console.log(dataString)
      }
  //    console.log('\nProof verification ended:', noSecs)
    } else {
  //    process.stdout.write('.')
    }
  })

  runCommand.stderr.on('data', (data) => {
    console.log(data.toString())
    succesfullyCompleted = false
  })

  runCommand.on('close', (code) => {
 //   console.log()
    setProofCodeBlocking(false)
    if(code=='1' || !succesfullyCompleted){
      cb(msgError)
    } else {
      cb(null)
    }
  })
}

function generateNewKeyPair(cb){
  var generateKeyPairProgram = './payment_in_out_generate_keypair'
  setProofCodeBlocking(true)
  if(singleProofGeneratorIsRunning){
    shutDown()
  }
  handleExecuteProgram(generateKeyPairProgram, [], 'Generating key pair...', 'The key pair has been generated and the keys written to files', 'The key pair failed\n\n', function(){
    cb()
  })
}

function logGeneratorOutput(proofGenerator){
  proofGenerator.stdout.on('data', (data) => {
    dataString = data.toString()

    if(dataString.indexOf('to generate a proof or q to quit')>-1){
      setProofCodeBlocking(false)
    }

    if(dataString.indexOf('System not satisfied!')>-1){
      console.log('Proof generation unsuccesful: System not satisfied')
      setProofCodeBlocking(false)
    }
    if(dataString.indexOf('Proving key loaded into memory')>-1){
      setProofCodeBlocking(false)
    }


    if(data.indexOf('Starting proof generation for')>-1){
  
      var matches = getMatches(dataString, /proof_[0-9]{0,4}/g)
      var payment_id = '1'  
      if(matches && matches.length>0){
        payment_id = matches[0].substring(13,matches[0].length)
        eventEmitter.emit('proofGenerationStarted', payment_id);
      } else {
//        console.log(dataString)
      }
    }

    if(data.indexOf('Proof was generated!!proof')>-1){
  
      var matches = getMatches(dataString, /proof_[0-9]{0,4}/g)
      var payment_id = '1'  
      if(matches && matches.length>0){
        payment_id = matches[0].substring(13,matches[0].length)
        eventEmitter.emit('proofGenerationComplete', payment_id);
      } else {
//        console.log(dataString)
      }
    }

  })

  proofGenerator.stderr.on('data', (data) => {
    console.log(data.toString())
  })

  proofGenerator.on('exit', function (code) {
    generatorIsRunning = false
  })

}

function loadProvingKey(){
  console.log('Loading proving key from file.  This will take a few seconds')
  setProofCodeBlocking(true)
  singleProofGenerator = spawn('./payment_in_out_generate_proof')
  logGeneratorOutput(singleProofGenerator)
  generatorIsRunning = true
}

function verifyProof(paymentId, cb){
    eventEmitter.emit('proofVerificationStarted', paymentId);
  var verifyProofProgram = './payment_in_out_verify_proof'
  handleExecuteProgram(verifyProofProgram, [paymentId], '', '', 'The proof verification failed\n\n', function(verifyErr){
    eventEmitter.emit('proofVerificationComplete', paymentId);
    cb(verifyErr)
  })
}

exports.LoadProvingKey = loadProvingKey
exports.SetProofCodeBlocking = setProofCodeBlocking
exports.GetProofCodeBlocking = getProofCodeBlocking
exports.ShutDown = shutDown
exports.GenerateNewKeyPair = generateNewKeyPair
exports.GenerateProof = generateProof
exports.VerifyProof = verifyProof
exports.Events = eventEmitter
