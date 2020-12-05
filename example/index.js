'use strict'
const CircuitBreaker = require('../lib/circuitbreaker.js')
let message

const options = {
  fallback: fallbackFunction,
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 10000
}

function unreliableFunction () {
  return new Promise((resolve, reject) => {
    if (Math.random() < 0.6) {
      resolve({ data: 'Success' })
      message = 'Success'
    } else {
      reject({ data: 'Failed' })
      message = 'Failed'
    }
  })
}
function fallbackFunction () {
  return new Promise((resolve, reject) => {
    resolve({ data: 'Expensive Fallback Successful' })
    message = 'Fallback'
  })
}


exports.handler = async (event) => {
  const circuitBreaker = new CircuitBreaker(unreliableFunction, options)

  let queue = circuitBreaker.fire()
  for(let x=0;x<100;x++){
    queue = queue.then(async ()=>{
      if (circuitBreaker.state === 'OPEN'){
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      return circuitBreaker.fire()
    })
  }

  await queue
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: message
    })
  }
  return response
}


exports.handler()

