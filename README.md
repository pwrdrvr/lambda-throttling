# AWS Lambda CPU Throttling Test Tool

This tool helps test and document AWS Lambda CPU throttling behavior at different memory levels. It deploys Lambda functions with various memory configurations and measures how CPU throttling affects execution.

## Background

AWS Lambda allocates CPU power in proportion to the memory configured for the function. According to AWS:

- At 1,769 MB, a function has the equivalent of 1 vCPU
- Lower memory settings receive a proportional share of CPU time
- For example, at 128 MB, a function receives roughly 7.2% (128/1,769) of a vCPU

This tool helps to:

1. Measure actual CPU throttling pauses at different memory settings
2. Visualize throttling patterns and ratios
3. Document the real-world impact of Lambda memory configuration on CPU-intensive tasks

## Results

**[View the latest visualization report](https://pwrdrvr.github.io/lambda-throttling/)**

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- AWS account with appropriate permissions
- AWS CLI configured with credentials (SSO supported)

### Installation

```bash
git clone https://github.com/pwrdrvr/lambda-throttling.git
cd lambda-throttling
npm install
```

### Usage

1. Build and deploy the Lambda functions with multiple memory configurations using CDK:

```bash
npm run deploy
```

This creates the following Lambda functions:
- `throttling-test-128mb` (128 MB)
- `throttling-test-256mb` (256 MB) 
- `throttling-test-512mb` (512 MB)
- `throttling-test-1024mb` (1024 MB)
- `throttling-test-1769mb` (1769 MB)
- `throttling-calibration-3000mb` (3000 MB) for baseline calibration
- `adaptive-throttling-128mb` (128 MB) for adaptive workload testing
- `adaptive-throttling-256mb` (256 MB) for adaptive workload testing
- `adaptive-throttling-512mb` (512 MB) for adaptive workload testing
- `adaptive-throttling-1024mb` (1024 MB) for adaptive workload testing
- `adaptive-throttling-1769mb` (1769 MB) for adaptive workload testing

2. Run the standard throttling tests to observe throttling behavior:

```bash
# Test all memory sizes (128, 256, 512, 1024, 1769 MB)
npm run test-throttling

# Test a specific memory size
npm run test-throttling:128
npm run test-throttling:256
npm run test-throttling:512
npm run test-throttling:1024
npm run test-throttling:1769

# Run a longer test (15 seconds)
npm run test-throttling:long

# Run with higher CPU intensity (500KB data)
npm run test-throttling:intense

# Run with extreme CPU intensity (1MB data)
npm run test-throttling:extreme

# Custom parameters
npx ts-node src/test-throttling.ts --memory=512 --duration=10000 --dataSize=200
```

3. Run the adaptive throttling tests that stay under throttle intervals:

```bash
# Test all memory sizes with adaptive workloads
npm run test-adaptive
```

4. Visualize the results:

```bash
# Visualize standard throttling tests
npm run visualize

# Visualize adaptive throttling tests
npm run visualize:adaptive
```

This generates HTML reports with charts in the `charts/` directory.

5. Run everything in sequence:

```bash
# Run standard throttling tests (deploy, test, visualize)
npm run run-all

# Run adaptive throttling tests (deploy, test, visualize)
npm run run-adaptive
```

## How It Works

### Standard Throttling Tests

1. **Calibration Phase:**
   - A 3,000 MB Lambda (over 1 full vCPU) is used to establish baseline performance
   - Warmup iterations stabilize performance
   - Precise measurements of unthrottled iteration time and CPU usage
   - Establishes baseline metrics for detecting throttling
   
2. **Testing Phase:**
   - Lambda functions at different memory levels run CPU-intensive operations:
     - Generates random data (configurable size, default 100KB)
     - Performs cryptographic operations (SHA-256 hashing)
     - Compresses data using zlib
     - Tracks CPU usage through the Node.js process.cpuUsage() API
   - Each iteration's performance is measured against the baseline
   - Both wall-clock time and CPU time are measured using high-resolution timers
   - Significant delays compared to baseline indicate throttling
   
3. **Analysis & Visualization:**
   - Calculates throttling ratio (percentage of time spent throttled)
   - Records timing of each iteration and throttling event
   - Measures CPU efficiency compared to the unthrottled baseline
   - Generates interactive visualizations showing throttling patterns
   - Tracks iteration-by-iteration performance to detect early throttling

### Adaptive Throttling Tests

1. **Smart CPU Allocation:**
   - Based on the principle that 1769 MB = 100% of a vCPU (1 full CPU)
   - Determines the Lambda function's CPU allocation as a fraction of a full vCPU
   - A 128 MB Lambda function receives approximately 7.2% of a CPU (128/1769)
   
2. **Throttle Interval Awareness:**
   - AWS Lambda throttles CPU in 20ms intervals
   - For example, a 128 MB Lambda gets approximately 1.44ms of CPU time per 20ms window (7.2% * 20ms)
   - Lambda is throttled (paused) for the remaining 18.56ms out of every 20ms interval

3. **Adaptive Workload Sizing:**
   - Calculates how much workload can be processed in a single throttle interval
   - Scales the data size based on the Lambda's CPU allocation percentage
   - Reduces the data size by 10% as a safety margin to avoid exceeding the throttle interval
   - Example: A 100KB job on a 1769 MB Lambda becomes a 7KB job on a 128 MB Lambda

4. **Precise Timing Control:**
   - Executes one unit of work per throttle interval (every 20ms)
   - Uses busy-waiting to ensure precise timing between iterations
   - Measures actual CPU time and wall clock time for each iteration
   - Records execution times to detect any unexpected throttling
   
5. **Analysis & Visualization:**
   - Compares CPU allocation percentages across memory sizes
   - Shows the adaptive data size for each memory configuration
   - Measures actual execution time against the 20ms throttle interval
   - Visualizes iteration-by-iteration performance 
   - Detects any potential throttling events where execution exceeds expectations

## Testing Methodology

The Lambda function:

1. Runs a tight loop consuming CPU
2. Measures execution time using Node.js's high-resolution `process.hrtime()`
3. Compares expected vs. actual execution time to detect throttling pauses
4. Records precise timings of each throttling event
5. Calculates a "throttling ratio" (percentage of time the function was throttled)

## Interpreting Results

- **Throttling Ratio**: Higher values indicate more aggressive throttling
- **Throttling Events**: Count of distinct pauses in execution
- **Event Timeline**: Shows when throttling occurred during execution
- **Delay Duration**: Shows the length of each throttling pause

## Example Visualizations

### Standard Throttling Tests

#### Throttling Ratio by Memory Size
This chart shows the percentage of time a function spends being throttled at different memory levels:

![Throttling Ratio Chart](https://raw.githubusercontent.com/pwrdrvr/lambda-throttling/main/docs/images/throttling-ratio.png)

#### Iteration Time Analysis
This chart shows the execution time of each iteration, helping identify throttling patterns:

![Iteration Times Chart](https://raw.githubusercontent.com/pwrdrvr/lambda-throttling/main/docs/images/iteration-times.png)

#### Throttling Events Timeline
This scatter plot shows when throttling events occurred and their severity:

![Throttling Events Timeline](https://raw.githubusercontent.com/pwrdrvr/lambda-throttling/main/docs/images/throttling-events.png)

### Adaptive Throttling Tests

#### CPU Allocation by Memory Size
This chart shows how CPU allocation scales with memory size:

![CPU Allocation Chart](https://raw.githubusercontent.com/pwrdrvr/lambda-throttling/main/docs/images/cpu-allocation.png)

#### Adaptive Data Size by Memory Size
This chart shows how the workload size is adjusted based on memory allocation:

![Adaptive Data Size Chart](https://raw.githubusercontent.com/pwrdrvr/lambda-throttling/main/docs/images/adaptive-data-size.png)

#### Execution Time by Memory Size
This chart shows CPU time vs. wall clock time for different memory sizes with adaptive workloads:

![Adaptive Execution Time Chart](https://raw.githubusercontent.com/pwrdrvr/lambda-throttling/main/docs/images/adaptive-execution-time.png)

For interactive visualizations with tooltips and more details, view the [full HTML report](https://pwrdrvr.github.io/lambda-throttling/).

## Memory Size and CPU Allocation

Memory configurations to test:

| Memory (MB) | Expected CPU % | Notes |
|-------------|----------------|-------|
| 128         | ~7.2%          | Function receives ~7.2% of a vCPU |
| 256         | ~14.5%         | Function receives ~14.5% of a vCPU |
| 512         | ~29%           | Function receives ~29% of a vCPU |
| 1024        | ~58%           | Function receives ~58% of a vCPU |
| 1769        | 100%           | Function receives full vCPU access |

## Troubleshooting

Common issues and their solutions:

- **Missing IAM Permissions**: Ensure your AWS credentials have appropriate Lambda and IAM permissions
- **CDK Deployment Errors**: Check that the AWS CDK is bootstrapped in your account and region
- **Lambda Timeout**: Increase the Lambda timeout in the CDK stack if needed
- **Cold Start Noise**: Initial test results may include cold start overhead; run tests multiple times for consistent results

## AWS SSO Support

This tool uses AWS SDK v3, which supports AWS SSO authentication. Make sure you've run `aws sso login` before running the tests if you're using AWS SSO.

## References

- [AWS Lambda Execution Environment](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html)
- [AWS Lambda Resource Model](https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-common.html)
- [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning)