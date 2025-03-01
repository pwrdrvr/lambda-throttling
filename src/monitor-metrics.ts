import AWS from 'aws-sdk';

// Configure AWS SDK
const region = process.env.AWS_REGION || 'us-east-2';
AWS.config.update({ region });

async function monitorLambdaMetrics() {
  const cloudwatch = new AWS.CloudWatch();
  const functionName = process.env.FUNCTION_NAME || 'throttling-test-function';
  
  // Set up time window for metrics (last 5 minutes)
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);
  
  console.log(`Monitoring Lambda metrics for function ${functionName}...`);
  
  try {
    // Get concurrency metrics
    const concurrencyData = await cloudwatch.getMetricData({
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
    }).promise();
    
    // Print metric results
    console.log('Metric Results:');
    
    console.log('Concurrent Executions:');
    if (concurrencyData.MetricDataResults![0].Values!.length > 0) {
      const maxConcurrency = Math.max(...concurrencyData.MetricDataResults![0].Values!);
      console.log(`- Maximum: ${maxConcurrency}`);
    } else {
      console.log('- No data available');
    }
    
    console.log('Throttles:');
    if (concurrencyData.MetricDataResults![1].Values!.length > 0) {
      const totalThrottles = concurrencyData.MetricDataResults![1].Values!.reduce((sum, val) => sum + val, 0);
      console.log(`- Total: ${totalThrottles}`);
    } else {
      console.log('- No data available');
    }
    
    console.log('Invocations:');
    if (concurrencyData.MetricDataResults![2].Values!.length > 0) {
      const totalInvocations = concurrencyData.MetricDataResults![2].Values!.reduce((sum, val) => sum + val, 0);
      console.log(`- Total: ${totalInvocations}`);
    } else {
      console.log('- No data available');
    }
    
  } catch (error) {
    console.error('Error monitoring Lambda metrics:', error);
  }
}

monitorLambdaMetrics().catch(console.error);