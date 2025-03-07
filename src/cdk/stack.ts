import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class LambdaThrottlingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define memory sizes to test
    const memorySizes = [128, 256, 512, 1024, 1769];
    
    // Create a calibration Lambda with 3000 MB RAM (more than 1 CPU)
    const calibrationFunctionName = `throttling-calibration-3000mb`;
    const calibrationFunction = new lambda.Function(this, `CalibrationTest3000MB`, {
      functionName: calibrationFunctionName,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'lambda-function.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'dist')),
      timeout: cdk.Duration.seconds(60), // Longer timeout for calibration
      memorySize: 3000,
      description: `Calibration Lambda function for measuring unthrottled performance`,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        IS_CALIBRATION: 'true',
      },
    });
    
    // Allow the calibration function to write to CloudWatch logs
    calibrationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );
    
    // Output the ARN and name of the calibration function
    new cdk.CfnOutput(this, `CalibrationFunction3000MB`, {
      value: calibrationFunction.functionArn,
      description: `The ARN of the calibration Lambda function with 3000MB memory`,
    });
    
    new cdk.CfnOutput(this, `CalibrationFunctionName3000MB`, {
      value: calibrationFunctionName,
      description: `The name of the calibration Lambda function with 3000MB memory`,
    });

    // Create a Lambda function for each memory size
    memorySizes.forEach(memorySize => {
      const functionName = `throttling-test-${memorySize}mb`;
      
      // Create the Lambda function with specific memory size
      const lambdaFunction = new lambda.Function(this, `ThrottlingTest${memorySize}MB`, {
        functionName,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'lambda-function.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'dist')),
        timeout: cdk.Duration.seconds(30),
        memorySize,
        description: `Lambda function for testing throttling behavior at ${memorySize} MB`,
        environment: {
          NODE_OPTIONS: '--enable-source-maps',
        },
      });

      // Allow the function to write to CloudWatch logs
      lambdaFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        })
      );

      // Output the ARN of each function
      new cdk.CfnOutput(this, `Function${memorySize}MB`, {
        value: lambdaFunction.functionArn,
        description: `The ARN of the throttling test Lambda function with ${memorySize}MB memory`,
      });
      
      // Output the function name
      new cdk.CfnOutput(this, `FunctionName${memorySize}MB`, {
        value: functionName,
        description: `The name of the throttling test Lambda function with ${memorySize}MB memory`,
      });
      
      // Create adaptive Lambda functions that stay under throttle intervals
      const adaptiveFunctionName = `adaptive-throttling-${memorySize}mb`;
      const adaptiveFunction = new lambda.Function(this, `AdaptiveThrottling${memorySize}MB`, {
        functionName: adaptiveFunctionName,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'adaptive-lambda-function.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'dist')),
        timeout: cdk.Duration.seconds(30),
        memorySize,
        description: `Adaptive Lambda function that stays under throttle intervals at ${memorySize} MB`,
        environment: {
          NODE_OPTIONS: '--enable-source-maps',
        },
      });
      
      // Allow the adaptive function to write to CloudWatch logs
      adaptiveFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        })
      );
      
      // Output the ARN and name of the adaptive function
      new cdk.CfnOutput(this, `AdaptiveFunction${memorySize}MB`, {
        value: adaptiveFunction.functionArn,
        description: `The ARN of the adaptive Lambda function with ${memorySize}MB memory`,
      });
      
      new cdk.CfnOutput(this, `AdaptiveFunctionName${memorySize}MB`, {
        value: adaptiveFunctionName,
        description: `The name of the adaptive Lambda function with ${memorySize}MB memory`,
      });
    });
  }
}