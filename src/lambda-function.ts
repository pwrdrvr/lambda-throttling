/**
 * Lambda function that detects CPU throttling by running CPU-intensive operations
 * and measuring execution time vs wall clock time.
 */
import * as crypto from 'crypto';
import * as zlib from 'zlib';

export const handler = async (event: any): Promise<any> => {
  console.log('Lambda function invoked with event:', JSON.stringify(event));
  
  // Determine if this is a calibration run
  const isCalibration = process.env.IS_CALIBRATION === 'true' || event.isCalibration === true;
  
  // Test parameters from event or defaults
  const testDurationMs = event.testDurationMs || (isCalibration ? 10000 : 5000); // Total test duration (longer for calibration)
  const intervalMs = event.intervalMs || 1; // How often to check the time (lower = more precision but more overhead)
  const logThreshold = event.logThreshold || 5; // Log when delays exceed this threshold (in ms)
  const startLogBuffer = event.startLogBuffer || 10; // Don't log delays in the first N ms (to avoid cold start noise)
  const dataSize = event.dataSize || 100 * 1024; // Size of data to process (default 100KB)
  
  // Calibration specific parameters
  const warmupIterations = isCalibration ? (event.warmupIterations || 50) : 0; // Number of warmup iterations for calibration
  const calibrationIterations = isCalibration ? (event.calibrationIterations || 500) : 0; // Number of iterations for calibration
  
  // Base values from previous calibration (if any)
  const baselineIterationTimeMs = event.baselineIterationTimeMs || 0;
  const baselineCpuTimePerIterationMs = event.baselineCpuTimePerIterationMs || 0;
  
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
    isCalibration,
    calibrationResults: isCalibration ? {
      averageIterationTimeMs: 0,
      averageCpuTimePerIterationMs: 0,
      totalWarmupIterations: warmupIterations,
      totalCalibrationIterations: calibrationIterations
    } : null,
    baselineIterationTimeMs,
    baselineCpuTimePerIterationMs,
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
  
  // For calibration mode
  const calibrationData: { iterationTimeMs: number, cpuTimeMs: number }[] = [];
  let lastIterationCpuTime = 0;
  let warmupComplete = false;
  
  // For collecting log messages to avoid logging during timing-sensitive operations
  const logMessages: string[] = [];
  
  if (isCalibration) {
    console.log(`Starting calibration with ${warmupIterations} warmup iterations and ${calibrationIterations} measurement iterations`);
    
    // Initial warmup phase to stabilize performance
    console.log('Starting warmup phase...');
    for (let i = 0; i < warmupIterations; i++) {
      burnCpu();
    }
    console.log('Warmup phase complete');
    warmupComplete = true;
    
    // Reset CPU usage tracking after warmup
    lastCheckTime = hrTime();
    lastIterationCpuTime = 0;
    const resetUsage = process.cpuUsage();
    
    // Calibration phase - collect precise measurements
    console.log('Starting calibration phase...');
    
    // We don't need to worry about avoiding console.log during calibration 
    // as we're measuring each iteration independently with high-resolution timers
    for (let i = 0; i < calibrationIterations; i++) {
      const iterationStartTime = hrTime();
      const iterationCpuStartTime = process.cpuUsage();
      
      // Perform CPU-intensive work
      burnCpu();
      
      // Measure time taken
      const iterationEndTime = hrTime();
      const iterationCpuEndTime = process.cpuUsage(iterationCpuStartTime);
      
      const iterationTime = iterationEndTime - iterationStartTime;
      const iterationCpuTime = (iterationCpuEndTime.user + iterationCpuEndTime.system) / 1000;
      
      calibrationData.push({
        iterationTimeMs: iterationTime,
        cpuTimeMs: iterationCpuTime
      });
      
      results.totalIterations++;
    }
    console.log('Calibration phase complete');
    
    // Calculate average metrics
    const totalIterationTime = calibrationData.reduce((sum, data) => sum + data.iterationTimeMs, 0);
    const totalCpuTime = calibrationData.reduce((sum, data) => sum + data.cpuTimeMs, 0);
    
    if (results.calibrationResults) {
      results.calibrationResults.averageIterationTimeMs = totalIterationTime / calibrationData.length;
      results.calibrationResults.averageCpuTimePerIterationMs = totalCpuTime / calibrationData.length;
    }
    
    // Add calibration statistics
    const iterationTimes = calibrationData.map(d => d.iterationTimeMs);
    const minIterationTime = Math.min(...iterationTimes);
    const maxIterationTime = Math.max(...iterationTimes);
    
    console.log(`Calibration results: Average iteration time: ${results.calibrationResults?.averageIterationTimeMs.toFixed(4)}ms, Average CPU time: ${results.calibrationResults?.averageCpuTimePerIterationMs.toFixed(4)}ms`);
    console.log(`Min iteration time: ${minIterationTime.toFixed(4)}ms, Max iteration time: ${maxIterationTime.toFixed(4)}ms`);
  } else {
    // Regular throttling test mode
    
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
      
      // If we have baseline data, use it to detect throttling more precisely
      let isThrottled = false;
      if (baselineIterationTimeMs > 0) {
        // Calculate expected time based on baseline metrics
        const cpuTimeDelta = cpuTimeUsed - lastIterationCpuTime;
        const expectedTime = baselineIterationTimeMs;
        const throttleFactor = elapsedSinceLastCheck / expectedTime;
        isThrottled = throttleFactor > 1.5; // If it took 50% longer than baseline, consider it throttled
        
        if (isThrottled) {
          logMessages.push(`Precise throttling detected: Took ${elapsedSinceLastCheck.toFixed(2)}ms vs expected ${expectedTime.toFixed(2)}ms (${throttleFactor.toFixed(2)}x slower)`);
        }
        
        lastIterationCpuTime = cpuTimeUsed;
      }
      
      // Only log significant delays and ignore initial startup time
      if ((elapsedSinceLastCheck > logThreshold && timeElapsedWallClock > startLogBuffer) || isThrottled) {
        results.throttlingEvents.push({
          wallClockTime: timeElapsedWallClock,
          detectedDelayMs: elapsedSinceLastCheck,
          timeFromStart: Date.now() - startRealTime,
          cpuTimeUsed
        });
        
        logMessages.push(`Throttling detected at ${timeElapsedWallClock}ms: ${elapsedSinceLastCheck.toFixed(2)}ms delay, CPU time used: ${cpuTimeUsed.toFixed(2)}ms`);
      }
      
      lastCheckTime = now;
      loopCount++;
    }
  }
  
  // Get final CPU usage for reporting
  const finalUsage = process.cpuUsage(startUsage);
  results.cpuTimeUsed = (finalUsage.user + finalUsage.system) / 1000; // Convert to ms
  
  // Calculate final results
  results.endTime = Date.now();
  results.totalWallClockTime = results.endTime - results.startTime;
  results.totalCpuTime = results.cpuTimeUsed; // Use the actual CPU time instead of high-resolution timer
  results.throttlingRatio = 1 - (results.cpuTimeUsed / results.totalWallClockTime);
  
  // Output collected log messages now that timing measurements are complete
  if (logMessages.length > 0) {
    console.log("\nDetailed throttling events:");
    logMessages.forEach((msg, index) => {
      console.log(`${index + 1}. ${msg}`);
    });
  }

  console.log(`Test completed. Wall clock time: ${results.totalWallClockTime}ms, CPU time: ${results.totalCpuTime.toFixed(2)}ms`);
  console.log(`CPU time used: ${results.cpuTimeUsed.toFixed(2)}ms, Total iterations: ${results.totalIterations}`);
  console.log(`Throttling ratio: ${(results.throttlingRatio * 100).toFixed(2)}% (higher = more throttling)`);
  console.log(`Detected ${results.throttlingEvents.length} throttling events`);
  
  return {
    statusCode: 200,
    body: JSON.stringify(results, null, 2)
  };
};