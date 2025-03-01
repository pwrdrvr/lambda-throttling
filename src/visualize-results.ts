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

const resultsDir = path.join(__dirname, '..', 'results');
const outputDir = path.join(__dirname, '..', 'charts');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function getAllResultFiles(): string[] {
  if (!fs.existsSync(resultsDir)) {
    console.error(`Results directory ${resultsDir} does not exist.`);
    return [];
  }
  
  return fs.readdirSync(resultsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(resultsDir, file));
}

// Optionally filter by memory size if specified
function getResultsByMemory(memorySize?: number): string[] {
  const allFiles = getAllResultFiles();
  
  if (!memorySize) {
    return allFiles;
  }
  
  return allFiles.filter(file => {
    const filename = path.basename(file);
    return filename.includes(`-${memorySize}MB-`);
  });
}

function loadResultFile(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const result = JSON.parse(data);
    return JSON.parse(result.body); // Parse the body from the Lambda response
  } catch (error) {
    console.error(`Error loading result file ${filePath}:`, error);
    return null;
  }
}

function generateHtmlChart(resultsData: any[]): string {
  // Group results by memory size
  const resultsByMemory: Record<string, any[]> = {};
  
  resultsData.forEach(result => {
    const memorySize = result.memorySize;
    if (!resultsByMemory[memorySize]) {
      resultsByMemory[memorySize] = [];
    }
    resultsByMemory[memorySize].push(result);
  });
  
  // Generate HTML with JavaScript charts
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AWS Lambda CPU Throttling Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    h1, h2 {
      color: #333;
    }
    .chart-container {
      margin-bottom: 30px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .summary-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 20px;
    }
    .stat-card {
      flex: 1;
      min-width: 200px;
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      margin: 5px 0;
    }
    canvas {
      max-height: 400px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>AWS Lambda CPU Throttling Analysis</h1>
    <p>This report shows CPU throttling behavior at different memory levels.</p>
    
    <div class="summary-stats">
      <div class="stat-card">
        <h3>Memory Sizes Tested</h3>
        <div class="stat-value">${Object.keys(resultsByMemory).length}</div>
      </div>
      <div class="stat-card">
        <h3>Total Tests</h3>
        <div class="stat-value">${resultsData.length}</div>
      </div>
    </div>
    
    <div class="chart-container">
      <h2>Throttling Ratio by Memory Size</h2>
      <canvas id="throttlingRatioChart"></canvas>
    </div>
    
    <div class="chart-container">
      <h2>Number of Throttling Events by Memory Size</h2>
      <canvas id="throttlingEventsChart"></canvas>
    </div>
`;

  // Add individual memory size sections with throttling events timelines
  Object.entries(resultsByMemory).forEach(([memorySize, results]) => {
    // Sort results by timestamp (most recent first)
    results.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    
    const latestResult = results[0];
    
    html += `
    <div class="chart-container">
      <h2>${memorySize} Memory - Throttling Events Timeline</h2>
      <p>Latest test from: ${new Date(latestResult.startTime).toLocaleString()}</p>
      <p>Throttling ratio: ${(latestResult.throttlingRatio * 100).toFixed(2)}%</p>
      <p>Events detected: ${latestResult.throttlingEvents.length}</p>
      <canvas id="timeline${memorySize.replace(/\D/g, '')}"></canvas>
    </div>
`;
  });

  // Add JavaScript for charts
  html += `
  <script>
    // Chart color palette
    const colorPalette = [
      'rgba(54, 162, 235, 0.7)',
      'rgba(255, 99, 132, 0.7)',
      'rgba(75, 192, 192, 0.7)',
      'rgba(255, 159, 64, 0.7)',
      'rgba(153, 102, 255, 0.7)'
    ];
    
    // Data preparation for throttling ratio chart
    const memoryLabels = ${JSON.stringify(Object.keys(resultsByMemory))};
    const ratioData = ${JSON.stringify(Object.entries(resultsByMemory).map(([_, results]) => {
      const latestResult = results[0];
      return (latestResult.throttlingRatio * 100).toFixed(2);
    }))};
    
    // Create throttling ratio chart
    new Chart(
      document.getElementById('throttlingRatioChart'),
      {
        type: 'bar',
        data: {
          labels: memoryLabels,
          datasets: [{
            label: 'Throttling Ratio (%)',
            data: ratioData,
            backgroundColor: colorPalette,
            borderColor: colorPalette.map(c => c.replace('0.7', '1')),
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Throttling Ratio (%)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Lambda Memory Size'
              }
            }
          }
        }
      }
    );
    
    // Data preparation for throttling events chart
    const eventsData = ${JSON.stringify(Object.entries(resultsByMemory).map(([_, results]) => {
      const latestResult = results[0];
      return latestResult.throttlingEvents.length;
    }))};
    
    // Create throttling events chart
    new Chart(
      document.getElementById('throttlingEventsChart'),
      {
        type: 'bar',
        data: {
          labels: memoryLabels,
          datasets: [{
            label: 'Number of Throttling Events',
            data: eventsData,
            backgroundColor: colorPalette,
            borderColor: colorPalette.map(c => c.replace('0.7', '1')),
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Events'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Lambda Memory Size'
              }
            }
          }
        }
      }
    );
`;

  // Add individual timeline charts for each memory size
  Object.entries(resultsByMemory).forEach(([memorySize, results], index) => {
    const latestResult = results[0];
    const events = latestResult.throttlingEvents;
    
    if (events.length === 0) {
      return; // Skip memory sizes with no events
    }
    
    html += `
    // Timeline for ${memorySize}
    new Chart(
      document.getElementById('timeline${memorySize.replace(/\D/g, '')}'),
      {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Throttling Events',
            data: ${JSON.stringify(events.map(e => ({
              x: e.timeFromStart,
              y: e.detectedDelayMs
            })))},
            backgroundColor: colorPalette[${index % 5}],
            pointRadius: 5,
          }]
        },
        options: {
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: {
                display: true,
                text: 'Time from Start (ms)'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Delay Duration (ms)'
              }
            }
          }
        }
      }
    );
`;
  });

  html += `
  </script>
  </div>
</body>
</html>`;

  return html;
}

function generateCharts(): void {
  // Get memory size from arguments or process all
  const memorySize = argMap.memory ? parseInt(argMap.memory) : undefined;
  const resultFiles = getResultsByMemory(memorySize);
  
  if (resultFiles.length === 0) {
    console.error('No result files found.');
    return;
  }
  
  console.log(`Found ${resultFiles.length} result files.`);
  
  // Load all result data
  const resultsData = resultFiles
    .map(loadResultFile)
    .filter(Boolean); // Remove nulls
  
  if (resultsData.length === 0) {
    console.error('No valid result data found.');
    return;
  }
  
  // Generate HTML chart
  const htmlContent = generateHtmlChart(resultsData);
  
  // Write the HTML file
  const timestamp = new Date().toISOString().replace(/:/g, '-').substring(0, 19);
  const outputPath = path.join(outputDir, `throttling-analysis-${timestamp}.html`);
  
  fs.writeFileSync(outputPath, htmlContent);
  console.log(`Chart generated at: ${outputPath}`);
}

// Run the visualization
generateCharts();