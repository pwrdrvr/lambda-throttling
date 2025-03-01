export const handler = async (event: any): Promise<any> => {
  console.log('Lambda function invoked with event:', JSON.stringify(event));
  
  // Simulate some work
  const startTime = Date.now();
  const duration = event.duration || 1000; // Default to 1 second
  
  // Simple busy-wait to simulate CPU-bound work
  while (Date.now() - startTime < duration) {
    // Busy wait
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Lambda execution completed',
      executionTime: Date.now() - startTime,
      requestedDuration: duration
    })
  };
};