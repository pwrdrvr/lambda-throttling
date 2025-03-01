/**
 * Test script for running the adaptive throttling tests
 * This script will invoke the adaptive Lambda functions that stay under the throttle intervals
 */
import { Lambda } from '@aws-sdk/client-lambda';
import fs from 'fs';
import path from 'path';

// Logger
const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`);

// Create Lambda client
const lambda = new Lambda({});

// Memory sizes to test
const memorySizes = [128, 256, 512, 1024, 1769];

// Test parameters
const testDurationMs = 10000; // 10 seconds total test duration
const iterations = Math.floor(testDurationMs / 20); // Run an iteration every 20ms
const timestamp = new Date().toISOString();

// Directory to save results
const resultsDir = path.join(__dirname, '..', 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Function to invoke a Lambda function and wait for results
const invokeLambda = async (functionName: string, payload: any): Promise<any> => {
  log(`Invoking ${functionName}...`);
  
  const response = await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(payload),
  });
  
  if (response.StatusCode !== 200) {
    throw new Error(`Lambda invocation failed with status code ${response.StatusCode}`);
  }
  
  // Parse response payload
  const responsePayload = Buffer.from(response.Payload!).toString('utf-8');
  return JSON.parse(responsePayload);
};

// Function to run tests for a specific memory size
const runTestForMemorySize = async (memorySize: number) => {
  const functionName = `adaptive-throttling-${memorySize}mb`;
  log(`Testing function ${functionName} with ${memorySize}MB memory`);
  
  try {
    // Set up test payload
    const payload = {
      testDurationMs,
      iterations,
      // We'll leave baseDataSizeKB at default (100KB) which should be
      // calibrated for a 1769MB Lambda to complete in ~20ms
    };
    
    // Invoke the Lambda function
    const response = await invokeLambda(functionName, payload);
    
    // Save results to a file
    const resultsFileName = `adaptive-throttling-${memorySize}MB-${timestamp}.json`;
    const resultsFilePath = path.join(resultsDir, resultsFileName);
    
    fs.writeFileSync(
      resultsFilePath,
      JSON.stringify(response, null, 2)
    );
    
    log(`Results saved to ${resultsFilePath}`);
    
    // Log a summary of the results
    const stats = response.body ? JSON.parse(response.body).stats : null;
    if (stats) {
      log(`Summary for ${memorySize}MB:`);
      log(`  Average CPU time: ${stats.avgCpuTime.toFixed(2)}ms`);
      log(`  Average wall clock time: ${stats.avgWallClockTime.toFixed(2)}ms`);
      log(`  Potential throttling events: ${stats.potentialThrottlingEvents}`);
    }
    
    return response;
  } catch (error) {
    log(`Error testing ${functionName}: ${error}`);
    throw error;
  }
};

// Function to run calibration
const runCalibration = async () => {
  log('Running calibration to get baseline performance...');
  
  const calibrationFunctionName = 'throttling-calibration-3000mb';
  
  try {
    // Set up calibration payload
    const calibrationPayload = {
      isCalibration: true,
      warmupIterations: 50,   
      calibrationIterations: 500,
      dataSize: 100 * 1024   // 100 KB standard test size
    };
    
    // Invoke the calibration function
    const calibrationResponse = await invokeLambda(calibrationFunctionName, calibrationPayload);
    
    // Extract calibration results
    const parsedBody = typeof calibrationResponse.body === 'string' 
      ? JSON.parse(calibrationResponse.body) 
      : calibrationResponse.body;
    
    if (parsedBody.calibrationResults) {
      const avgCpuTimePerIteration = parsedBody.calibrationResults.averageCpuTimePerIterationMs;
      log(`Calibration results: CPU time for 100KB workload: ${avgCpuTimePerIteration.toFixed(2)}ms`);
      return {
        cpuTimeFor100KBMs: avgCpuTimePerIteration,
        baseDataSizeKB: 100  // The size we used for calibration
      };
    } else {
      log('Calibration failed to return proper results, using default values');
      return {
        cpuTimeFor100KBMs: 3.6, // Default value based on prior experiments
        baseDataSizeKB: 100
      };
    }
  } catch (error) {
    log(`Calibration error: ${error}`);
    log('Using default calibration values');
    return {
      cpuTimeFor100KBMs: 3.6, // Default value based on prior experiments
      baseDataSizeKB: 100
    };
  }
};

// Function to run tests for a specific memory size with calibration data
const runTestForMemorySizeWithCalibration = async (memorySize: number, calibrationData: any) => {
  const functionName = `adaptive-throttling-${memorySize}mb`;
  log(`Testing function ${functionName} with ${memorySize}MB memory using calibration data`);
  
  try {
    // Set up test payload with calibration data
    const payload = {
      testDurationMs,
      iterations,
      calibrationCpuTimeFor100KBMs: calibrationData.cpuTimeFor100KBMs,
      calibrationDataSizeKB: calibrationData.baseDataSizeKB
    };
    
    // Invoke the Lambda function
    const response = await invokeLambda(functionName, payload);
    
    // Save results to a file
    const resultsFileName = `adaptive-throttling-${memorySize}MB-${timestamp}.json`;
    const resultsFilePath = path.join(resultsDir, resultsFileName);
    
    fs.writeFileSync(
      resultsFilePath,
      JSON.stringify(response, null, 2)
    );
    
    log(`Results saved to ${resultsFilePath}`);
    
    // Log a summary of the results
    const stats = response.body ? JSON.parse(response.body).stats : null;
    if (stats) {
      log(`Summary for ${memorySize}MB:`);
      log(`  Calibrated data size: ${stats.calibratedDataSizeKB}KB`);
      log(`  Average CPU time: ${stats.avgCpuTime.toFixed(2)}ms`);
      log(`  Average wall clock time: ${stats.avgWallClockTime.toFixed(2)}ms`);
      log(`  Potential throttling events: ${stats.potentialThrottlingEvents}`);
    }
    
    return response;
  } catch (error) {
    log(`Error testing ${functionName}: ${error}`);
    throw error;
  }
};

// Main function to run all tests
const runTests = async () => {
  log('Starting adaptive throttling tests...');
  
  // First run calibration
  const calibrationData = await runCalibration();
  log(`Using calibration data: CPU time for 100KB = ${calibrationData.cpuTimeFor100KBMs.toFixed(2)}ms`);
  
  // Run tests for each memory size sequentially with calibration data
  for (const memorySize of memorySizes) {
    await runTestForMemorySizeWithCalibration(memorySize, calibrationData);
  }
  
  log('All tests completed successfully!');
};

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});