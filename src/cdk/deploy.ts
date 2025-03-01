import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

async function deploy() {
  try {
    // Check if node_modules exists, if not run npm install
    if (!fs.existsSync(path.join(__dirname, '..', '..', 'node_modules'))) {
      console.log('Installing dependencies...');
      await exec('npm install');
    }
    
    console.log('Building Lambda function...');
    await exec('ts-node src/cdk/build.ts');
    
    console.log('Deploying with CDK...');
    // Check if CDK app is bootstrapped
    try {
      await exec('cdk bootstrap');
      console.log('CDK bootstrapped successfully');
    } catch (error) {
      console.log('CDK bootstrap already exists or failed, continuing with deployment');
    }
    
    // Deploy the stack
    const { stdout, stderr } = await exec('cdk deploy --require-approval never');
    
    console.log('Deployment Output:');
    console.log(stdout);
    
    if (stderr) {
      console.error('Deployment Errors:');
      console.error(stderr);
    }
    
    console.log('Lambda function deployed successfully');
  } catch (error) {
    console.error('Error during deployment:', error);
    process.exit(1);
  }
}

deploy();