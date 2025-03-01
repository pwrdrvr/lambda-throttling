/**
 * Lambda function that detects CPU throttling by running a spin loop
 * and measuring execution time vs wall clock time.
 */
export const handler = async (event: any): Promise<any> => {
  console.log('Lambda function invoked with event:', JSON.stringify(event));
  
  // Test parameters from event or defaults
  const testDurationMs = event.testDurationMs || 5000; // Total test duration in ms (default 5 seconds)
  const intervalMs = event.intervalMs || 1; // How often to check the time (lower = more precision but more overhead)
  const logThreshold = event.logThreshold || 5; // Log when delays exceed this threshold (in ms)
  const startLogBuffer = event.startLogBuffer || 10; // Don't log delays in the first N ms (to avoid cold start noise)
  
  // Results data structure
  const results = {
    startTime: Date.now(),
    endTime: 0,
    totalWallClockTime: 0,
    totalCpuTime: 0,
    throttlingRatio: 0,
    throttlingEvents: [] as {
      wallClockTime: number,
      detectedDelayMs: number,
      timeFromStart: number
    }[],
    memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 'unknown',
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
    functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown'
  };
  
  // Timer function that returns high-resolution time in ms
  const hrTime = () => {
    const time = process.hrtime();
    return time[0] * 1000 + time[1] / 1000000;
  };
  
  // Start tracking time
  let lastCheckTime = hrTime();
  let loopCount = 0;
  const startRealTime = Date.now();
  let totalCpuTimeMs = 0;
  
  // Run the spin loop until we reach the test duration
  while (Date.now() - startRealTime < testDurationMs) {
    // Check the time after each interval
    const now = hrTime();
    const elapsedSinceLastCheck = now - lastCheckTime;
    totalCpuTimeMs += elapsedSinceLastCheck;
    
    // Detect delays (throttling) by comparing actual elapsed time with expected interval
    // We allow for some overhead in the check itself
    const timeElapsedWallClock = Date.now() - startRealTime;
    
    // Only log significant delays and ignore initial startup time
    if (elapsedSinceLastCheck > logThreshold && timeElapsedWallClock > startLogBuffer) {
      results.throttlingEvents.push({
        wallClockTime: timeElapsedWallClock,
        detectedDelayMs: elapsedSinceLastCheck,
        timeFromStart: Date.now() - startRealTime
      });
      
      console.log(`Throttling detected at ${timeElapsedWallClock}ms: ${elapsedSinceLastCheck.toFixed(2)}ms delay`);
    }
    
    lastCheckTime = now;
    loopCount++;
    
    // Small pause to allow for better event loop scheduling
    // Without this, Node.js might optimize the loop too aggressively
    if (loopCount % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  // Calculate final results
  results.endTime = Date.now();
  results.totalWallClockTime = results.endTime - results.startTime;
  results.totalCpuTime = totalCpuTimeMs;
  results.throttlingRatio = 1 - (totalCpuTimeMs / results.totalWallClockTime);
  
  console.log(`Test completed. Wall clock time: ${results.totalWallClockTime}ms, CPU time: ${results.totalCpuTime.toFixed(2)}ms`);
  console.log(`Throttling ratio: ${(results.throttlingRatio * 100).toFixed(2)}% (higher = more throttling)`);
  console.log(`Detected ${results.throttlingEvents.length} throttling events`);
  
  return {
    statusCode: 200,
    body: JSON.stringify(results, null, 2)
  };
};