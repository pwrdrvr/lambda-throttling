/**
 * Visualization script for the adaptive throttling test results
 */
import * as fs from 'fs';
import * as path from 'path';

// Results directory
const resultsDir = path.join(__dirname, '..', 'results');
// Charts directory
const chartsDir = path.join(__dirname, '..', 'charts');

// Create charts directory if it doesn't exist
if (!fs.existsSync(chartsDir)) {
  fs.mkdirSync(chartsDir, { recursive: true });
}

// Get result files for adaptive tests
const getAdaptiveResultFiles = () => {
  const files = fs.readdirSync(resultsDir);
  return files.filter(file => file.startsWith('adaptive-throttling-') && file.endsWith('.json'));
};

// Parse the result files
const parseResultFiles = (files: string[]) => {
  return files.map(filename => {
    const filePath = path.join(resultsDir, filename);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const result = JSON.parse(fileContent);
    
    // Extract memory size from filename (e.g., "adaptive-throttling-128MB-2023-01-01T00-00-00.000Z.json")
    const match = filename.match(/adaptive-throttling-(\d+)MB/);
    const memorySize = match ? parseInt(match[1], 10) : 0;
    
    return {
      filename,
      memorySize,
      result
    };
  }).sort((a, b) => a.memorySize - b.memorySize); // Sort by memory size
};

// Generate HTML chart
const generateHtml = (results: any[]) => {
  // Format timestamp for the chart title
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  
  // Extract data for charts
  const memorySizes = results.map(r => r.memorySize);
  
  // Process results data
  const processedResults = results.map(r => {
    const parsedBody = typeof r.result.body === 'string' ? JSON.parse(r.result.body) : r.result.body;
    return {
      memorySize: r.memorySize,
      cpuAllocation: parsedBody.cpuAllocation,
      calibrationDataSizeKB: parsedBody.calibrationDataSizeKB || 100,
      calibrationCpuTimeFor100KBMs: parsedBody.calibrationCpuTimeFor100KBMs || 3.6,
      calibratedDataSizeKB: parsedBody.calibratedDataSizeKB || parsedBody.initialDataSizeKB || parsedBody.adaptiveDataSizeKB,
      avgCpuTime: parsedBody.stats.avgCpuTime,
      avgWallClockTime: parsedBody.stats.avgWallClockTime,
      minCpuTime: parsedBody.stats.minCpuTime,
      maxCpuTime: parsedBody.stats.maxCpuTime,
      minWallClockTime: parsedBody.stats.minWallClockTime,
      maxWallClockTime: parsedBody.stats.maxWallClockTime,
      potentialThrottlingEvents: parsedBody.stats.potentialThrottlingEvents,
      cpuUtilizationPercent: parsedBody.stats.cpuUtilizationPercent || 0,
      allowedCpuTimePerInterval: parsedBody.stats.allowedCpuTimePerInterval || 0,
      iterationResults: parsedBody.iterationResults
    };
  });
  
  // Prepare chart data
  const cpuAllocations = processedResults.map(r => ({
    x: r.memorySize,
    y: (r.cpuAllocation * 100).toFixed(2)
  }));
  
  const calibratedDataSizes = processedResults.map(r => ({
    x: r.memorySize,
    y: r.calibratedDataSizeKB
  }));
  
  const cpuUtilization = processedResults.map(r => ({
    x: r.memorySize,
    y: r.cpuUtilizationPercent.toFixed(2)
  }));
  
  const allowedCpuTime = processedResults.map(r => ({
    x: r.memorySize,
    y: r.allowedCpuTimePerInterval.toFixed(2)
  }));
  
  const avgCpuTimes = processedResults.map(r => ({
    x: r.memorySize,
    y: r.avgCpuTime.toFixed(2)
  }));
  
  const avgWallClockTimes = processedResults.map(r => ({
    x: r.memorySize,
    y: r.avgWallClockTime.toFixed(2)
  }));
  
  const potentialThrottlings = processedResults.map(r => ({
    x: r.memorySize,
    y: r.potentialThrottlingEvents
  }));
  
  // Generate iteration data for each memory size
  const iterationChartData = processedResults.map(r => {
    return {
      memorySize: r.memorySize,
      iterations: r.iterationResults.map((iter: any, index: number) => ({
        x: index + 1,
        y: iter.wallClockTimeMs
      }))
    };
  });
  
  // HTML template
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>AWS Lambda Adaptive Throttling Analysis - ${timestamp}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
    }
    .chart-container {
      width: 90%;
      max-width: 1200px;
      margin: 20px auto;
    }
    .results-container {
      width: 90%;
      max-width: 1200px;
      margin: 20px auto;
      overflow-x: auto;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: right;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    tr:hover {
      background-color: #f1f1f1;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>AWS Lambda Adaptive Throttling Analysis</h1>
    <p>Test results from ${timestamp}</p>
    <p>This analysis shows how Lambda functions with different memory allocations adapt their workloads to stay under throttle intervals</p>
  </div>
  
  <div class="chart-container">
    <h2>CPU Allocation by Memory Size</h2>
    <p>Shows how CPU allocation scales with memory size (based on 1769MB = 100% vCPU)</p>
    <canvas id="cpuAllocationChart"></canvas>
  </div>
  
  <div class="chart-container">
    <h2>Adaptive Data Size by Memory Size</h2>
    <p>Shows how the workload size is adjusted based on memory allocation</p>
    <canvas id="dataSizeChart"></canvas>
  </div>
  
  <div class="chart-container">
    <h2>Average Execution Time by Memory Size</h2>
    <p>Shows CPU time vs wall clock time for different memory sizes</p>
    <canvas id="executionTimeChart"></canvas>
  </div>
  
  <div class="chart-container">
    <h2>CPU Utilization by Memory Size</h2>
    <p>How well we utilized our allowed CPU time in each 20ms interval</p>
    <canvas id="cpuUtilizationChart"></canvas>
  </div>
  
  <div class="chart-container">
    <h2>Potential Throttling Events by Memory Size</h2>
    <p>Count of iterations that took longer than expected (may indicate throttling)</p>
    <canvas id="throttlingEventsChart"></canvas>
  </div>
  
  <div class="chart-container">
    <h2>Iteration Execution Time by Memory Size</h2>
    <p>Wall clock time for each iteration across different memory sizes</p>
    <canvas id="iterationTimeChart"></canvas>
  </div>
  
  <div class="results-container">
    <h2>Summary Results</h2>
    <table>
      <tr>
        <th>Memory (MB)</th>
        <th>CPU Allocation (%)</th>
        <th>Allowed CPU Time (ms)</th>
        <th>Calibrated Data Size (KB)</th>
        <th>Avg CPU Time (ms)</th>
        <th>CPU Utilization (%)</th>
        <th>Avg Wall Clock (ms)</th>
        <th>Min/Max CPU (ms)</th>
        <th>Min/Max Wall Clock (ms)</th>
        <th>Potential Throttling</th>
      </tr>
      ${processedResults.map(r => `
      <tr>
        <td>${r.memorySize}</td>
        <td>${(r.cpuAllocation * 100).toFixed(2)}%</td>
        <td>${r.allowedCpuTimePerInterval.toFixed(2)}</td>
        <td>${r.calibratedDataSizeKB}</td>
        <td>${r.avgCpuTime.toFixed(2)}</td>
        <td>${r.cpuUtilizationPercent.toFixed(2)}%</td>
        <td>${r.avgWallClockTime.toFixed(2)}</td>
        <td>${r.minCpuTime.toFixed(2)}/${r.maxCpuTime.toFixed(2)}</td>
        <td>${r.minWallClockTime.toFixed(2)}/${r.maxWallClockTime.toFixed(2)}</td>
        <td>${r.potentialThrottlingEvents}</td>
      </tr>
      `).join('')}
    </table>
  </div>
  
  <script>
    // CPU Allocation Chart
    new Chart(document.getElementById('cpuAllocationChart'), {
      type: 'bar',
      data: {
        datasets: [{
          label: 'CPU Allocation (%)',
          data: ${JSON.stringify(cpuAllocations)},
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Memory Size (MB)'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'CPU Allocation (%)'
            }
          }
        }
      }
    });
    
    // Data Size Chart
    new Chart(document.getElementById('dataSizeChart'), {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Calibrated Data Size (KB)',
            data: ${JSON.stringify(calibratedDataSizes)},
            backgroundColor: 'rgba(75, 192, 192, 0.7)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Memory Size (MB)'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Data Size (KB)'
            }
          }
        }
      }
    });
    
    // Execution Time Chart
    new Chart(document.getElementById('executionTimeChart'), {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Avg CPU Time (ms)',
            data: ${JSON.stringify(avgCpuTimes)},
            backgroundColor: 'rgba(255, 99, 132, 0.7)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          },
          {
            label: 'Avg Wall Clock Time (ms)',
            data: ${JSON.stringify(avgWallClockTimes)},
            backgroundColor: 'rgba(153, 102, 255, 0.7)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Memory Size (MB)'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Time (ms)'
            }
          }
        }
      }
    });
    
    // CPU Utilization Chart
    new Chart(document.getElementById('cpuUtilizationChart'), {
      type: 'bar',
      data: {
        datasets: [{
          label: 'CPU Utilization (%)',
          data: ${JSON.stringify(cpuUtilization)},
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Memory Size (MB)'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'CPU Utilization (%)'
            }
          }
        }
      }
    });
    
    // Throttling Events Chart
    new Chart(document.getElementById('throttlingEventsChart'), {
      type: 'bar',
      data: {
        datasets: [{
          label: 'Potential Throttling Events',
          data: ${JSON.stringify(potentialThrottlings)},
          backgroundColor: 'rgba(255, 159, 64, 0.7)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Memory Size (MB)'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Count'
            }
          }
        }
      }
    });
    
    // Iteration Time Chart
    new Chart(document.getElementById('iterationTimeChart'), {
      type: 'line',
      data: {
        datasets: ${JSON.stringify(iterationChartData.map(item => ({
          label: item.memorySize + 'MB',
          data: item.iterations,
          borderWidth: 1,
          pointRadius: 0
        })))}
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Iteration Number'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Wall Clock Time (ms)'
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
          }
        }
      }
    });
  </script>
</body>
</html>`;

  // Save the HTML to a file
  const htmlFileName = `adaptive-throttling-analysis-${timestamp.replace(/:/g, '-')}.html`;
  const htmlFilePath = path.join(chartsDir, htmlFileName);
  
  fs.writeFileSync(htmlFilePath, html);
  console.log(`HTML chart generated: ${htmlFilePath}`);
  
  return htmlFilePath;
};

// Main function
const main = () => {
  // Get result files
  const resultFiles = getAdaptiveResultFiles();
  
  if (resultFiles.length === 0) {
    console.log('No adaptive throttling test results found.');
    return;
  }
  
  console.log(`Found ${resultFiles.length} result files.`);
  
  // Parse result files
  const results = parseResultFiles(resultFiles);
  
  // Generate HTML chart
  const htmlFilePath = generateHtml(results);
  
  console.log('Visualization completed successfully.');
  console.log(`Open ${htmlFilePath} in a browser to view the results.`);
};

// Run the main function
main();