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
    });
  }
}