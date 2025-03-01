import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  // Ensure the dist directory exists
  const distPath = path.join(__dirname, '..', '..', 'dist');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }

  // Build the Lambda function
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'lambda-function.ts')],
    bundle: true,
    minify: false,
    sourcemap: true,
    platform: 'node',
    target: ['node20'],
    outfile: path.join(distPath, 'lambda-function.js'),
    external: ['aws-sdk'],
  });

  console.log('Lambda function built successfully');
}

build().catch(err => {
  console.error('Error building Lambda function:', err);
  process.exit(1);
});