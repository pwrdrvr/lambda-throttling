import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const argMap: Record<string, string> = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substr(2).split('=');
    if (key && value) {
      argMap[key] = value;
    }
  }
});

// Configure AWS SDK
const region = process.env.AWS_REGION || 'us-east-2';
const lambdaClient = new LambdaClient({ region });

// Default settings
const memorySizes = argMap.memory 
  ? [parseInt(argMap.memory)] 
  : [128, 256, 512, 1024, 1769];
const testDurationMs = parseInt(argMap.duration || '5000');
const dataSize = parseInt(argMap.dataSize || '100') * 1024; // Data size in KB, convert to bytes
const resultsDir = path.join(__dirname, '..', 'results');

// Ensure results directory exists
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

async function runThrottlingTest(memorySize: number): Promise<any> {
  const functionName = `throttling-test-${memorySize}mb`;
  
  console.log(`Running test with ${memorySize}MB memory (${functionName})...`);
  
  try {
    const payload = JSON.stringify({
      testDurationMs,
      logThreshold: 5, // Log delays greater than 5ms
      dataSize, // Size of data to process in bytes
    });
    
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(payload)
    });
    
    const response = await lambdaClient.send(command);
    
    if (response.StatusCode !== 200) {
      console.error(`Error invoking function: ${response.FunctionError}`);
      return null;
    }
    
    const responsePayload = new TextDecoder().decode(response.Payload);
    const result = JSON.parse(responsePayload);
    
    return result;
  } catch (error) {
    console.error(`Error running test for ${memorySize}MB:`, error);
    return null;
  }
}

async function saveResults(memorySize: number, results: any): Promise<void> {
  if (!results) return;
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `throttling-${memorySize}MB-${timestamp}.json`;
  const filePath = path.join(resultsDir, filename);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    console.log(`Results saved to ${filePath}`);
  } catch (error) {
    console.error(`Error saving results to ${filePath}:`, error);
  }
}

async function runTests(): Promise<void> {
  console.log(`Starting throttling tests with duration ${testDurationMs}ms...`);
  
  // Run tests for each memory size
  for (const memorySize of memorySizes) {
    const results = await runThrottlingTest(memorySize);
    
    if (results) {
      const body = JSON.parse(results.body);
      
      console.log(`\nResults for ${memorySize}MB:`);
      console.log(`- Memory: ${body.memorySize}`);
      console.log(`- Function: ${body.functionName}`);
      console.log(`- Wall clock time: ${body.totalWallClockTime}ms`);
      console.log(`- CPU time: ${parseFloat(body.totalCpuTime).toFixed(2)}ms`);
      console.log(`- Throttling ratio: ${(body.throttlingRatio * 100).toFixed(2)}%`);
      console.log(`- Throttling events: ${body.throttlingEvents.length}`);
      
      if (body.throttlingEvents.length > 0) {
        console.log('\nThrottling events:');
        body.throttlingEvents.forEach((event: any, index: number) => {
          if (index < 10) { // Only show first 10 events to avoid console spam
            console.log(`  ${index + 1}. At ${event.timeFromStart}ms: ${event.detectedDelayMs.toFixed(2)}ms delay`);
          }
        });
        
        if (body.throttlingEvents.length > 10) {
          console.log(`  ... ${body.throttlingEvents.length - 10} more events`);
        }
      }
      
      // Save results to file
      await saveResults(memorySize, results);
    }
    
    // Add a small delay between tests
    if (memorySize !== memorySizes[memorySizes.length - 1]) {
      console.log('\nWaiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\nAll tests completed.');
}

runTests().catch(console.error);