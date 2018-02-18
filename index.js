var prompt = require('prompt')
var colors = require('colors/safe')
var fs = require('fs')
var events = require('events');
var automation = require('./client/automation.js')

const sha256 = require('sha256')

let startTime = null
let proofsVerified = {}
let proofsGenerated = {}
let numberOfProofsVerified = 0
let numberOfProofsGenerated = 0

var startBalance = 0
var endBalance = 0
var incoming = [0, 0, 0, 0, 0, 0]
var outgoing = [0, 0, 0, 0, 0, 0]
var noPayments = 6

if (process.argv.length != 3) {
  console.log("you need to set your start balance.  Run the application using node index.js startBalance=1000")
  return 1
}

process.argv.forEach(val => {
  if (val.startsWith("startBalance")) {
    startBalance = parseInt(val.split("=")[1])
    endBalance = startBalance
  }
});

function longToByteArray(valueToConvert) {
  // we want to represent the input as a 8-bytes array
  var byteArray = new Array(16)
    .map(ele => {
      const byte = valueToConvert & 0xff;
      valueToConvert = (valueToConvert - byte) / 256;
      return byte;
    })
    .reverse();

  return byteArray;
}

function getArray(value) {
  var r_value = longToByteArray(value)
  var arr_salt = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  return r_value.concat(arr_salt)
}

function getListOfArrays(inputArray) {
  returnVal = []
  for (var i = 0; i < noPayments; i++) {
    returnVal.push(getArray(inputArray[i]))
  }
  return returnVal
}

function getListOfBuffers(inputArray) {
  returnVal = []
  for (var i = 0; i < noPayments; i++) {
    returnVal.push(Buffer.from(inputArray[i]))
  }
  return returnVal
}

function getListOfSha(inputArray) {
  returnVal = []
  for (var i = 0; i < noPayments; i++) {
    returnVal.push(sha256(inputArray[i], { asBytes: true }))
  }
  return returnVal
}

function generateProofInputs(paymentId, cb) {

  var arr_startBalance = getArray(startBalance)
  var arr_endBalance = getArray(endBalance)
  var arr_incoming = getListOfArrays(incoming)
  var arr_outgoing = getListOfArrays(outgoing)

  var b_startBalance = Buffer.from(arr_startBalance)
  var b_endBalance = Buffer.from(arr_endBalance)
  var b_incoming = getListOfBuffers(arr_incoming)
  var b_outgoing = getListOfBuffers(arr_outgoing)

  var public_startBalance = sha256(b_startBalance, { asBytes: true })
  var public_endBalance = sha256(b_endBalance, { asBytes: true })
  var public_incoming = getListOfSha(b_incoming)
  var public_outgoing = getListOfSha(b_outgoing)

  var publicParameters = public_startBalance.toString().replace(/,/g, ' ') + "\n"
  publicParameters += public_endBalance.toString().replace(/,/g, ' ') + "\n"
  publicParameters += public_incoming[0].toString().replace(/,/g, ' ') + "\n"


  publicParameters += public_outgoing[0].toString().replace(/,/g, ' ') + "\n"

  var privateParameters = arr_startBalance.toString().replace(/,/g, ' ') + "\n"
  privateParameters += arr_endBalance.toString().replace(/,/g, ' ') + "\n"
  privateParameters += arr_incoming[0].toString().replace(/,/g, ' ') + "\n"

  privateParameters += arr_outgoing[0].toString().replace(/,/g, ' ') + "\n"


  fs.writeFile('publicInputParameters_' + paymentId, publicParameters, function (errPublic) {
    if (errPublic) {
      cb('An error occured generating the public input parameters', errPublic)
    } else {
      fs.writeFile('privateInputParameters_' + paymentId, privateParameters, function (errPrivate) {
        if (errPrivate) {
          cb('An error occured generating the private input parameters', errPrivate)
        } else {
          cb('', null)
        }
      })
    }
  })
}

function checkAllFilesExist(cb) {

  var fileName = 'provingKey'
  fs.exists(fileName, (exists) => {
    cb(exists)
  })

}

function checkForKeypairAndRunGenerateProof(cb) {
  checkAllFilesExist(function (exists) {
    if (exists == true) {
      automation.LoadProvingKey()
      cb()
    } else {
      console.log("\nThe provingKey and verificationKey need to be generated\n")
      automation.GenerateNewKeyPair(function () {
        automation.LoadProvingKey()
        cb()
      })
    }
  })
}

function handleGenerateSinglePaymentProof(cb) {
  fs.unlink('proof', function (error) {
    automation.SetProofCodeBlocking(true)
    console.log('Please enter the amounts that are being paid')
    prompt.get(['incoming', 'outgoing'], function (err, paymentAmountInputs) {
      incoming[0] = parseInt(paymentAmountInputs.incoming)
      incoming[1] = 0
      incoming[2] = 0
      incoming[3] = 0
      outgoing[0] = parseInt(paymentAmountInputs.outgoing)
      outgoing[1] = 0
      outgoing[2] = 0
      outgoing[3] = 0
      endBalance = startBalance + incoming[0] - outgoing[0]

      generateProofInputs(1, function (msg1, err1) {
        if (err1) {
          console.log(msg1, err1)
        } else {
          console.log('Process started')
          automation.GenerateProof(1)
        }
        cb()
      })
    })
  })
}

function handleSinglePayment() {
  if (automation.GetProofCodeBlocking() == true) {
    process.stdout.write('.')
    setTimeout(handleSinglePayment, 500)
  } else {
    console.log('')
    console.log('Start balance:', startBalance)
    console.log('Incoming payment:', incoming[0])
    console.log('Outgoing payment:', outgoing[0])
    console.log('End balance:', endBalance)
    console.log('')
    console.log('Please select an option:\n1) Create a new key pair\n2) Generate a single-payment proof\n3) Verify single-payment proof\n0) Quit')
    prompt.get(['option'], function (err, answer) {
      if (answer.option == 1) {
        automation.GenerateNewKeyPair(function () {
          automation.LoadProvingKey()
          handleSinglePayment()
        })
      } else if (answer.option == 2) {
        handleGenerateSinglePaymentProof(function () {
          handleSinglePayment()
        })
      } else if (answer.option == 3) {
        automation.VerifyProof(1, function (verifyErr) {
          if (verifyErr) {
            console.log(verifyErr)
            handleSinglePayment()
          } else {
            console.log('Verification was succesful')
            startBalance = endBalance
            for (var i = 0; i < noPayments; i++) {
              incoming[i] = 0
              outgoing[i] = 0
            }
            handleSinglePayment()
          }
        })
      } else {
        automation.ShutDown()
        console.log('Quiting...')
      }
    })
  }
}

var simulatorStatus = 'processing payments'
var paymentId = 10
var statusColor = colors.white
var queuedPayments = []
var unconfirmedPayments = []
var availableLiquidity = startBalance

function getUnconfirmedPaymentById(payment_id) {
  var result = unconfirmedPayments.filter(function (o) { return o.paymentId == payment_id })
  return result ? result[0] : null; // or undefined
}

function removeUnconfimedPayment(payment_id) {
  var arrayWithoutUnconfirmedPayment = unconfirmedPayments.filter(function (obj) {
    return obj.paymentId != payment_id
  })
  return arrayWithoutUnconfirmedPayment
}

var onProofGenerationStarted = function (payment_id) {
  if (payment_id > 1) {  //We use ids greater than 1 for the simulator
    var unconfirmedPayment = getUnconfirmedPaymentById(payment_id)
    unconfirmedPayment.status = 'Generating proof'
  }
}

var onProofGenerationComplete = function (payment_id) {
  automation.SetProofCodeBlocking(false)
  if (payment_id > 1) {  //We use ids greater than 1 for the simulator
    automation.VerifyProof(payment_id, function (verifyErr) {
      if (verifyErr) {
        console.log(verifyErr)
      } else {
        // proof is verified, get the right payment
        var unconfirmedPayment = getUnconfirmedPaymentById(payment_id)
        unconfirmedPayment.status = 'verifying proof'
        //  console.log('payment: ', unconfirmedPayment)
        if (unconfirmedPayment.direction == 'incoming') {
          startBalance = startBalance + unconfirmedPayment.amount
          availableLiquidity = availableLiquidity + unconfirmedPayment.amount
        } else {
          startBalance = startBalance - unconfirmedPayment.amount
        }
        unconfirmedPayments = removeUnconfimedPayment(payment_id)
      }
    })
  }
}

automation.Events.on('proofGenerationStarted', onProofGenerationStarted);
automation.Events.on('proofGenerationComplete', onProofGenerationComplete);

automation.Events.on('proofGenerationStarted', function (paymentId) {
  if (startTime === null) {
    startTime = new Date().getTime()
  }
  proofsGenerated[paymentId] = {
    startTime: new Date().getTime(),
    elapsedTime: null
  }
});

automation.Events.on('proofGenerationComplete', function (paymentId) {
  numberOfProofsGenerated++
  let elapsedTime = new Date().getTime() - proofsGenerated[paymentId].startTime
  proofsGenerated[paymentId].elapsedTime = elapsedTime
});

automation.Events.on('proofVerificationStarted', function (paymentId) {
  if (startTime === null) {
    startTime = new Date().getTime()
  }
  proofsVerified[paymentId] = {
    startTime: new Date().getTime(),
    elapsedTime: null
  }
});

automation.Events.on('proofVerificationComplete', function (paymentId) {
  numberOfProofsVerified++
  let elapsedTime = new Date().getTime() - proofsVerified[paymentId].startTime
  proofsVerified[paymentId].elapsedTime = elapsedTime
});

function handleStartSelection() {
  console.log('')
  console.log('Please select an option:\n1) Single payment in and single payment out\n0) Quit')
  prompt.get(['option'], function (err, answer) {
    if (answer.option == 1) {
      checkForKeypairAndRunGenerateProof(function () {
        handleSinglePayment()
      })
    } else {
      console.log('Quiting...')
    }
  })
}

handleStartSelection()
