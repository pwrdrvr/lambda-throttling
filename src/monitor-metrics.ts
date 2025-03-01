import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';

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
const cloudwatchClient = new CloudWatchClient({ region });

async function monitorLambdaMetrics() {
  const functionName = process.env.FUNCTION_NAME || argMap.function || 'throttling-test-function';
  
  // Custom time window in minutes (default 5 minutes)
  const timeWindowMinutes = parseInt(argMap.minutes || '5');
  
  // Set up time window for metrics
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - timeWindowMinutes * 60 * 1000);
  
  console.log(`Monitoring Lambda metrics for function ${functionName}...`);
  
  try {
    // Get concurrency metrics
    const command = new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'concurrency',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'ConcurrentExecutions',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: functionName
                }
              ]
            },
            Period: 60,
            Stat: 'Maximum'
          }
        },
        {
          Id: 'throttles',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Throttles',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: functionName
                }
              ]
            },
            Period: 60,
            Stat: 'Sum'
          }
        },
        {
          Id: 'invocations',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Invocations',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: functionName
                }
              ]
            },
            Period: 60,
            Stat: 'Sum'
          }
        }
      ],
      StartTime: startTime,
      EndTime: endTime
    });
    
    const concurrencyData = await cloudwatchClient.send(command);
    
    // Print metric results
    console.log('Metric Results:');
    
    console.log('Concurrent Executions:');
    if (concurrencyData.MetricDataResults && concurrencyData.MetricDataResults.length > 0 && concurrencyData.MetricDataResults[0].Values && concurrencyData.MetricDataResults?.[0].Values?.length > 0) {
      const maxConcurrency = Math.max(...concurrencyData.MetricDataResults[0].Values!);
      console.log(`- Maximum: ${maxConcurrency}`);
    } else {
      console.log('- No data available');
    }
    
    console.log('Throttles:');
    if (concurrencyData.MetricDataResults && concurrencyData.MetricDataResults.length > 1 && concurrencyData.MetricDataResults[1].Values && concurrencyData.MetricDataResults?.[1].Values?.length > 0) {
      const totalThrottles = concurrencyData.MetricDataResults[1].Values!.reduce((sum, val) => sum + val, 0);
      console.log(`- Total: ${totalThrottles}`);
    } else {
      console.log('- No data available');
    }
    
    console.log('Invocations:');
    if (concurrencyData.MetricDataResults && concurrencyData.MetricDataResults.length > 2 && concurrencyData.MetricDataResults[2].Values && concurrencyData.MetricDataResults?.[2].Values?.length > 0) {
      const totalInvocations = concurrencyData.MetricDataResults[2].Values!.reduce((sum, val) => sum + val, 0);
      console.log(`- Total: ${totalInvocations}`);
    } else {
      console.log('- No data available');
    }
    
  } catch (error) {
    console.error('Error monitoring Lambda metrics:', error);
  }
}

monitorLambdaMetrics().catch(console.error);