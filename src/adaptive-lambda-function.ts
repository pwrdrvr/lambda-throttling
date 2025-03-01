/**
 * Lambda function that adapts the workload to stay just under the AWS Lambda throttle interval.
 * Based on the principle that 1769 MB = 1 vCPU with throttling occurring in 20ms intervals.
 */
import * as crypto from 'crypto';
import * as zlib from 'zlib';

export const handler = async (event: any): Promise<any> => {
  console.log('Adaptive Lambda function invoked with event:', JSON.stringify(event));
  
  // Get Lambda memory allocation
  const memorySize = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '128', 10);
  
  // Calculate CPU allocation as a fraction of a full vCPU
  const cpuAllocation = memorySize / 1769;
  
  // Calculate how much work we can do in a throttle interval (20ms)
  // We subtract 10% as a safety margin to avoid hitting throttling
  const throttleIntervalMs = 20;
  const safetyFactor = 0.9;
  const allowedWorkloadPerInterval = cpuAllocation * throttleIntervalMs * safetyFactor;
  
  // Base data size (calibrated for 1769 MB Lambda)
  const baseDataSizeKB = event.baseDataSizeKB || 100; // Size in KB for 1769 MB Lambda to process in ~20ms
  
  // Calculate initial adaptive data size for our Lambda based on its memory allocation
  let adaptiveDataSizeKB = Math.max(1, Math.floor(baseDataSizeKB * cpuAllocation));
  let dataSize = adaptiveDataSizeKB * 1024;
  
  // Flag to track if we've adapted the data size after the first iteration
  let hasAdaptedDataSize = false;
  
  // Target CPU time - we want to use about 80% of our allowed CPU time
  // to leave room for variations in performance
  const targetCpuTimeMs = allowedWorkloadPerInterval * 0.8;
  
  console.log(`CPU allocation: ${(cpuAllocation * 100).toFixed(2)}% of a vCPU`);
  console.log(`Allowed workload per 20ms interval: ${allowedWorkloadPerInterval.toFixed(2)}ms of CPU time`);
  console.log(`Target CPU time per iteration: ${targetCpuTimeMs.toFixed(2)}ms`);
  console.log(`Initial adaptive data size: ${adaptiveDataSizeKB}KB`);

  // Test parameters from event or defaults
  const testDurationMs = event.testDurationMs || 5000; // Total test duration
  const iterations = event.iterations || Math.floor(testDurationMs / throttleIntervalMs); // Number of iterations to run
  
  // Results data structure
  const results = {
    startTime: Date.now(),
    endTime: 0,
    totalWallClockTime: 0,
    totalCpuTime: 0,
    memorySize,
    cpuAllocation,
    initialDataSizeKB: adaptiveDataSizeKB,
    finalDataSizeKB: adaptiveDataSizeKB, // Will be updated if adaptation occurs
    totalIterations: 0,
    iterationResults: [] as {
      iteration: number,
      wallClockTimeMs: number,
      cpuTimeMs: number,
      dataSizeKB: number,
      startTime: number
    }[]
  };
  
  // Function to perform CPU-intensive work with the calculated data size
  function performWork(size: number): void {
    // Generate random data
    const data = crypto.randomBytes(size);
    
    // Hash it (CPU intensive)
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    // Compress it (also CPU intensive)
    const compressed = zlib.deflateSync(data);
    
    // More hashing for good measure
    crypto.createHash('sha512').update(compressed).digest('hex');
  }
  
  console.log(`Starting test with ${iterations} iterations, one every ${throttleIntervalMs}ms`);
  
  // Perform the work in timed intervals
  for (let i = 0; i < iterations; i++) {
    const iterationStartTime = Date.now();
    const iterationCpuStart = process.cpuUsage();
    
    // Perform the work with current data size
    performWork(dataSize);
    results.totalIterations++;
    
    // Measure CPU time used
    const cpuUsage = process.cpuUsage(iterationCpuStart);
    const cpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1000; // Convert to ms
    
    // Record results
    const wallClockTimeMs = Date.now() - iterationStartTime;
    results.iterationResults.push({
      iteration: i + 1,
      wallClockTimeMs,
      cpuTimeMs,
      dataSizeKB: adaptiveDataSizeKB,
      startTime: iterationStartTime - results.startTime
    });
    
    // Adapt data size after first iteration if needed
    if (i === 0 && !hasAdaptedDataSize) {
      // Calculate ratio of actual to target CPU time
      const cpuTimeRatio = targetCpuTimeMs / cpuTimeMs;
      
      // Only adapt if the ratio is significantly different from 1
      if (cpuTimeRatio < 0.7 || cpuTimeRatio > 1.3) {
        // Adjust data size based on the ratio (keeping it within reasonable bounds)
        const newDataSizeKB = Math.max(1, Math.floor(adaptiveDataSizeKB * cpuTimeRatio));
        
        console.log(`Adapting data size based on first iteration: ${adaptiveDataSizeKB}KB -> ${newDataSizeKB}KB (CPU time: ${cpuTimeMs.toFixed(2)}ms, target: ${targetCpuTimeMs.toFixed(2)}ms)`);
        
        adaptiveDataSizeKB = newDataSizeKB;
        dataSize = adaptiveDataSizeKB * 1024;
        results.finalDataSizeKB = adaptiveDataSizeKB;
        hasAdaptedDataSize = true;
      } else {
        console.log(`First iteration CPU time ${cpuTimeMs.toFixed(2)}ms is close to target ${targetCpuTimeMs.toFixed(2)}ms, keeping data size at ${adaptiveDataSizeKB}KB`);
      }
    }
    
    console.log(`Iteration ${i + 1}: Wall clock: ${wallClockTimeMs.toFixed(2)}ms, CPU: ${cpuTimeMs.toFixed(2)}ms, Data size: ${adaptiveDataSizeKB}KB`);
    
    // Wait until the next 20ms interval to start the next iteration
    // This ensures we're not stacking work across throttle intervals
    const iterationEndTime = Date.now();
    const elapsed = iterationEndTime - iterationStartTime;
    
    // Calculate time to next interval boundary (multiples of throttleIntervalMs)
    let remainingTimeInInterval = 0;
    
    if (elapsed < throttleIntervalMs) {
      // If iteration completed within the throttle interval, wait for the remainder
      remainingTimeInInterval = throttleIntervalMs - elapsed;
    } else {
      // If iteration took longer than throttle interval, wait until next boundary
      remainingTimeInInterval = throttleIntervalMs - (elapsed % throttleIntervalMs);
      if (remainingTimeInInterval === throttleIntervalMs) remainingTimeInInterval = 0;
    }
    
    if (i < iterations - 1 && remainingTimeInInterval > 0) {
      // Use a Promise-based sleep to efficiently wait without using CPU
      console.log(`Sleeping for ${remainingTimeInInterval.toFixed(2)}ms until next interval`);
      await new Promise(resolve => setTimeout(resolve, remainingTimeInInterval));
    }
  }
  
  // Calculate final results
  results.endTime = Date.now();
  results.totalWallClockTime = results.endTime - results.startTime;
  
  // Calculate total CPU time
  const finalCpuUsage = process.cpuUsage();
  results.totalCpuTime = (finalCpuUsage.user + finalCpuUsage.system) / 1000; // Convert to ms
  
  // Calculate stats on iterations
  const cpuTimes = results.iterationResults.map(r => r.cpuTimeMs);
  const wallClockTimes = results.iterationResults.map(r => r.wallClockTimeMs);
  
  const avgCpuTime = cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length;
  const maxCpuTime = Math.max(...cpuTimes);
  const minCpuTime = Math.min(...cpuTimes);
  
  const avgWallClockTime = wallClockTimes.reduce((a, b) => a + b, 0) / wallClockTimes.length;
  const maxWallClockTime = Math.max(...wallClockTimes);
  const minWallClockTime = Math.min(...wallClockTimes);
  
  console.log(`\nTest completed in ${results.totalWallClockTime}ms with ${results.totalIterations} iterations`);
  console.log(`CPU time: avg=${avgCpuTime.toFixed(2)}ms, min=${minCpuTime.toFixed(2)}ms, max=${maxCpuTime.toFixed(2)}ms`);
  console.log(`Wall clock: avg=${avgWallClockTime.toFixed(2)}ms, min=${minWallClockTime.toFixed(2)}ms, max=${maxWallClockTime.toFixed(2)}ms`);
  
  // Determine if we've successfully avoided throttling
  const throttlingThreshold = throttleIntervalMs * 1.5; // If any iteration takes 50% longer than throttle interval
  const potentialThrottlingEvents = wallClockTimes.filter(t => t > throttlingThreshold).length;
  
  if (potentialThrottlingEvents > 0) {
    console.log(`WARNING: Detected ${potentialThrottlingEvents} potential throttling events`);
  } else {
    console.log('SUCCESS: No throttling detected - workload was properly adapted to Lambda size');
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      ...results,
      stats: {
        avgCpuTime,
        minCpuTime,
        maxCpuTime,
        avgWallClockTime,
        minWallClockTime,
        maxWallClockTime,
        potentialThrottlingEvents
      }
    }, null, 2)
  };
};