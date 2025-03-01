import AWS from 'aws-sdk';

// Configure AWS SDK
const region = process.env.AWS_REGION || 'us-east-2';
AWS.config.update({ region });

async function testLambdaThrottling() {
  const lambda = new AWS.Lambda();
  const functionName = process.env.FUNCTION_NAME || 'throttling-test-function';
  
  // Set up test parameters
  const concurrentInvocations = 200; // Number of concurrent invocations
  const duration = 2000; // Duration of each Lambda in milliseconds
  
  console.log(`Starting throttling test with ${concurrentInvocations} concurrent invocations...`);
  
  // Store results
  const results = {
    successful: 0,
    throttled: 0,
    failed: 0,
    invocationTimes: [] as number[]
  };
  
  // Invoke Lambda functions concurrently
  const invocations = Array(concurrentInvocations).fill(0).map(async (_, index) => {
    const startTime = Date.now();
    
    try {
      const response = await lambda.invoke({
        FunctionName: functionName,
        InvocationType: 'RequestResponse', // Synchronous invocation
        Payload: JSON.stringify({
          duration,
          invocationId: index
        })
      }).promise();
      
      const endTime = Date.now();
      results.invocationTimes.push(endTime - startTime);
      
      if (response.StatusCode === 200) {
        results.successful++;
      } else {
        results.failed++;
      }
      
      return response;
    } catch (error: any) {
      const endTime = Date.now();
      results.invocationTimes.push(endTime - startTime);
      
      if (error.code === 'TooManyRequestsException') {
        results.throttled++;
        console.log(`Invocation ${index} was throttled`);
      } else {
        results.failed++;
        console.error(`Invocation ${index} failed with error:`, error);
      }
      
      return error;
    }
  });
  
  // Wait for all invocations to complete
  await Promise.all(invocations);
  
  // Print results
  console.log('Throttling test completed:');
  console.log(`- Successful invocations: ${results.successful}`);
  console.log(`- Throttled invocations: ${results.throttled}`);
  console.log(`- Failed invocations: ${results.failed}`);
  
  // Calculate statistics
  if (results.invocationTimes.length > 0) {
    const avgTime = results.invocationTimes.reduce((sum, time) => sum + time, 0) / results.invocationTimes.length;
    const minTime = Math.min(...results.invocationTimes);
    const maxTime = Math.max(...results.invocationTimes);
    
    console.log('Invocation Times:');
    console.log(`- Average: ${avgTime.toFixed(2)}ms`);
    console.log(`- Minimum: ${minTime}ms`);
    console.log(`- Maximum: ${maxTime}ms`);
  }
}

testLambdaThrottling().catch(console.error);