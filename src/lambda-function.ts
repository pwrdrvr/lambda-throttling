/**
 * Lambda function that detects CPU throttling by running CPU-intensive operations
 * and measuring execution time vs wall clock time.
 */
import * as crypto from 'crypto';
import * as zlib from 'zlib';

export const handler = async (event: any): Promise<any> => {
  console.log('Lambda function invoked with event:', JSON.stringify(event));
  
  // Test parameters from event or defaults
  const testDurationMs = event.testDurationMs || 5000; // Total test duration in ms (default 5 seconds)
  const intervalMs = event.intervalMs || 1; // How often to check the time (lower = more precision but more overhead)
  const logThreshold = event.logThreshold || 5; // Log when delays exceed this threshold (in ms)
  const startLogBuffer = event.startLogBuffer || 10; // Don't log delays in the first N ms (to avoid cold start noise)
  const dataSize = event.dataSize || 100 * 1024; // Size of data to process (default 100KB)
  
  // Results data structure
  const results = {
    startTime: Date.now(),
    endTime: 0,
    totalWallClockTime: 0,
    totalCpuTime: 0,
    throttlingRatio: 0,
    cpuTimeUsed: 0,
    totalIterations: 0,
    throttlingEvents: [] as {
      wallClockTime: number,
      detectedDelayMs: number,
      timeFromStart: number,
      cpuTimeUsed: number
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
  
  // CPU usage tracking
  const startUsage = process.cpuUsage();
  
  // Function to perform CPU-intensive work
  function burnCpu(): void {
    // Generate random data
    const data = crypto.randomBytes(dataSize);
    
    // Hash it (CPU intensive)
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    // Compress it (also CPU intensive)
    const compressed = zlib.deflateSync(data);
    
    // More hashing for good measure
    crypto.createHash('sha512').update(compressed).digest('hex');
  }
  
  // Start tracking time
  let lastCheckTime = hrTime();
  let loopCount = 0;
  const startRealTime = Date.now();
  let totalCpuTimeMs = 0;
  
  // Run the CPU-intensive loop until we reach the test duration
  while (Date.now() - startRealTime < testDurationMs) {
    // Perform CPU-intensive work
    burnCpu();
    results.totalIterations++;
    
    // Check the time after each iteration
    const now = hrTime();
    const elapsedSinceLastCheck = now - lastCheckTime;
    totalCpuTimeMs += elapsedSinceLastCheck;
    
    // Get current CPU usage
    const currentUsage = process.cpuUsage(startUsage);
    const cpuTimeUsed = (currentUsage.user + currentUsage.system) / 1000; // Convert to ms
    
    // Detect delays (throttling) by comparing actual elapsed time with expected interval
    const timeElapsedWallClock = Date.now() - startRealTime;
    
    // Only log significant delays and ignore initial startup time
    if (elapsedSinceLastCheck > logThreshold && timeElapsedWallClock > startLogBuffer) {
      results.throttlingEvents.push({
        wallClockTime: timeElapsedWallClock,
        detectedDelayMs: elapsedSinceLastCheck,
        timeFromStart: Date.now() - startRealTime,
        cpuTimeUsed
      });
      
      console.log(`Throttling detected at ${timeElapsedWallClock}ms: ${elapsedSinceLastCheck.toFixed(2)}ms delay, CPU time used: ${cpuTimeUsed.toFixed(2)}ms`);
    }
    
    lastCheckTime = now;
    loopCount++;
  }
  
  // Get final CPU usage for reporting
  const finalUsage = process.cpuUsage(startUsage);
  results.cpuTimeUsed = (finalUsage.user + finalUsage.system) / 1000; // Convert to ms
  
  // Calculate final results
  results.endTime = Date.now();
  results.totalWallClockTime = results.endTime - results.startTime;
  results.totalCpuTime = results.cpuTimeUsed; // Use the actual CPU time instead of high-resolution timer
  results.throttlingRatio = 1 - (results.cpuTimeUsed / results.totalWallClockTime);
  
  console.log(`Test completed. Wall clock time: ${results.totalWallClockTime}ms, CPU time: ${results.totalCpuTime.toFixed(2)}ms`);
  console.log(`CPU time used: ${results.cpuTimeUsed.toFixed(2)}ms, Total iterations: ${results.totalIterations}`);
  console.log(`Throttling ratio: ${(results.throttlingRatio * 100).toFixed(2)}% (higher = more throttling)`);
  console.log(`Detected ${results.throttlingEvents.length} throttling events`);
  
  return {
    statusCode: 200,
    body: JSON.stringify(results, null, 2)
  };
};