#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LambdaThrottlingStack } from './stack';

const app = new cdk.App();
new LambdaThrottlingStack(app, 'LambdaThrottlingStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-2' 
  },
});