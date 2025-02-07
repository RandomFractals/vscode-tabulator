// Loosely based on: https://observablehq.com/@observablehq/summary-table
/* eslint-disable curly */
import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';

const htl = require('htl');
const html = htl.html;

const NUMBER = 'number';
const DATE = 'date';
const ORDINAL = 'ordinal';
const CONTINUOUS = 'continuous';
const COUNT = 'count';
const MEAN = 'mean';
const SUMMARY = 'summary';
const UNLABELED = 'unlabeled';

const ABSOLUTE = 'absolute';
const INLINE_BLOCK = 'inline-block';
const START = 'start';
const TOP = 'top';
const VISIBLE = 'visible';
const NONE = 'none';

const CATEGORY = ' category';
const CATEGORIES = ' categories';

const BLUE = 'blue';
const BLUES = 'blues';
const DARK_BLUE = 'darkblue';
const BLACK = 'black';

const percentFormat = d3.format('.1%');

// bars color map
const colorMap = new Map([
  [ORDINAL, 'rgba(78, 121, 167, 1)'],
  [CONTINUOUS, 'rgba(242, 142, 44, 1)'],
  [DATE, 'rgba(225,87,89, 1)']
].map(d => {
  const color = d3.color(d[1]);
  const colorCopy = color.copy({opacity: 0.6});
  return [d[0], {color: color.formatRgb(), brighter: colorCopy.formatRgb()}];
}));

/**
 * Gets data value type.
 * @param {*} data Data object.
 * @param {*} column Column/property name.
 * @returns 
 */
function getType(data, column) {
  const value = data[column];
  if (value === null) return ORDINAL;
  if (typeof value === NUMBER) return CONTINUOUS;
  if (value instanceof Date) return DATE;    
  // if all are null, return ordinal
  return ORDINAL;
}

/**
 * Creates summary table document fragment for display.
 */
export function summaryTable(data) {
  const dataSample = data[0] || {};
  const columns = data.columns || Object.keys(dataSample);

  // create summary card and track data shape
  const dataSummaryCard = summaryCard(data);
  const dataSummary = {
    rowCount: dataSummaryCard.value.rowCount,
    columnCount: dataSummaryCard.value.columnCount,
    columns: columns
  };
  const columnValues = [];

  // compose summary table fragment
  const width = 900;
  let dataSummaryElement = htl.html`<div style="display: inline-block; vertical-align: top;">${dataSummaryCard}</div>
      <div style="display: inline-block;">
        <table style="vertical-align: middle; display: block; overflow-x: auto; max-width: ${width}px;">
          <thead style="z-index: -999;">
          <th>column</th>
          <th style="min-width: 250px">snapshot</th>
          <th>missing</th>
          <th>mean</th>
          <th>median</th>
          <th>SD</th>
        </thead>
      ${columns.map(column => {
        const columnElement = summarizeColumn(data, column);
        // add column values
        columnValues.push(columnElement.value);
        return columnElement;
      })}
    </table>
  </div>`;
  dataSummaryElement.value = dataSummary;
  return dataSummaryElement;
}

/**
 * Creates data summary card table view.
 */
export function summaryCard(data) {
  // compute column data values
  const dataSample = data[0] || {};
  const columns = data.columns || Object.keys(dataSample);
  const columnData = columns.map(columnName => {
    return {
      label: (columnName === '') ? UNLABELED : columnName,
      type: getType(data, columnName)
    };
  });
  const columnCount = columnData.length;
  const rowCount = data.length;
  
  // create header row plot
  const headerRowPlot = addTooltips(
    Plot.cellX(columnData, {
      fill: d => colorMap.get(d.type).color,
      title: d => `${d.label}\n(${d.type})`
    })
    .plot({
      x: {axis: null},
      width: 100,
      height: 10,
      color: {
        domain: [...colorMap.values()].map(d => d.color)
      }, 
      style: {
        overflow: VISIBLE,
        width: '100px'
      }
    }),
    {
      stroke: BLACK, 
      "stroke-width": '3px'
    }
  );
  
  // crate columns plot
  const columnsPlot = Plot.cellX(columnData, {
      fill: d => colorMap.get(d.type).color, 
      fillOpacity: .3
    })
    .plot({
      x:{axis: null},
      width: 100,
      height: 80,
      color: {
        domain: [...colorMap.values()].map(d => d.color)
      },
      style: {
        overflow: VISIBLE,
        width: '100px'
      }
    });
  
  const arrowDownStyles = {
    display: INLINE_BLOCK,
    verticalAlign: TOP,
    transformOrigin: '0 0',
    transform: 'rotate(90deg)',
    marginTop: '20px',
    position: ABSOLUTE,
    left: '114px',
    top: '54px'
  };
  const label = SUMMARY;
  const summaryCardElement = htl.html`<div class="data-summary-card">
      <span style="font-size:1.2em">${label}</span>
      <div>${d3.format(',.0f')(columnCount)} ⟶</div>
      ${headerRowPlot}
      <span style="display: inline-block">${columnsPlot}</span>
      <span style="display: inline-block; vertical-align: top; padding: 5px;">${d3.format(',.0f')(rowCount)}<br/></span>
      <span style=${arrowDownStyles}>⟶</span>
    </div>`;
  
  summaryCardElement.value = {rowCount, columnCount};
  return summaryCardElement;
}

/**
 * Creates summary view for a single data column.
 * @param {*} data 
 * @param {*} col 
 * @returns 
 */
function summarizeColumn(data, col) {  
  let content, value, format, el, chart, missingLabel, percentMissing, min, max, median, mean, sd;
  
  // construct content based on column data type
  const type = getType(data, col);  
  const col1 = htl.html`<td 
    style="white-space: nowrap; vertical-align: middle; padding-right: 5px; padding-left: 3px;">
    ${icons[type]()}
    <strong style="vertical-align: middle;">${col === "" ? "unlabeled" : col}</strong></td>`;
  switch(type) {
    case ORDINAL: // categorial columns
      format = d3.format(',.0f');
      // calculate category percent and count
      const categories = d3.rollups(data, 
          v => ({count: v.length, percent: v.length / data.length || 1}), 
          d => d[col]
        )
        .sort((a, b) => b[1].count - a[1].count)
        .map(d => {
          let obj = {};
          obj[col] = (d[0] === null || d[0] === '') ? '(missing)' : d[0];
          obj.count = d[1].count;
          obj.percent = d[1].percent;
          return obj;
      });
      
      // calculate percent missing
      percentMissing = data.filter(d => d[col] === null).length / data.length;
      
      // create horizontal columnn stack chart
      const stackChart = smallStack(categories, col);
      
      // create column data summary table row
      el = htl.html`<tr style="font-family: sans-serif; font-size: 12px;">
        ${col1}          
        <td><div style="position: relative;">${stackChart}</div></td>
        <td>${percentFormat(percentMissing)}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
      </tr>`;
      
      value = {
        column: col, type, 
        min: null, max: null, 
        mean: null, median: null, sd: null, 
        missing: percentMissing, 
        categories: categories.length
      };
      break;
    case DATE: 
      // calculate and format start/end times
      const start = d3.min(data, d => +d[col]);
      const end = d3.max(data, d => +d[col]);
      mean = d3.mean(data, d => +d[col]);
      median = d3.median(data, d => +d[col]);
      sd = d3.deviation(data, d => +d[col]);
      
      // calculate percent missing
      percentMissing = data.filter(d => d[col] === null).length / data.length;
      chart = histogram(data, col, type);
      
      // create column data summary table row
      el = htl.html`<tr style="font-family: sans-serif; font-size: 12px;">
          ${col1}
          <td><div style="position: relative;">${chart}</div></td>
          <td>${percentFormat(percentMissing)}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </tr>`;
      value = {
        column: col, type, 
        min:start, max: end, 
        mean: null, median: null, sd: null, 
        missing: percentMissing, 
        categories:null 
      };
      break;
    default:  // continuous columns
      // compute values 
      format = d3.format(',.0f');
      min = d3.min(data, d => +d[col]);
      max = d3.max(data, d => +d[col]);
      mean = d3.mean(data, d => +d[col]);
      median = d3.median(data, d => +d[col]);
      sd = d3.deviation(data, d => +d[col]);
      percentMissing = data.filter(d => d[col] === null).length / data.length;      
      chart = histogram(data, col, type);
      // create column data summary table row
      el = htl.html`<tr style="font-family: sans-serif; font-size: 12px;">
        ${col1}
        <td><div style="position: relative; top: 3px;">${chart}</div></td>
        <td>${percentFormat(percentMissing)}</td>
        <td>${format(mean)}</td>
        <td>${format(median)}</td>
        <td>${format(sd)}</td>
      </tr>`;      
      value = {
        column: col, type, 
        min, max, mean, median, sd, 
        missing: percentMissing, 
        categories: null
      };
      break;
  }  
  el.value = value;
  el.appendChild(html`<style>
    td {
      vertical-align: middle;
    }
  </style>`);
  return el;
}


function smallStack(categoryData, col) {
  // horizontal stacked bar
  const label = categoryData.length === 1 ? CATEGORY : CATEGORIES;
  return addTooltips(
    Plot.barX(categoryData, {
      x: COUNT,
      fill: col,
      y: 0,
      title: d => d[col] + '\n' + percentFormat(d.percent)
    })
    .plot({
      color: {
        scheme: BLUES
      },
      marks:[
        Plot.text([0,0], {
          x: 0, 
          dy: 13, 
          text: d => d3.format(',.0f')(categoryData.length) + `${label}`
        })
      ], 
      width: 205,
      height: 30,
      style: {
        paddingTop: '0px',
        paddingBottom: '15px',
        textAnchor: START,
        overflow: VISIBLE,
        width: '205px'
      }, 
      color: {
        domain: categoryData.map(d => d[col]), 
        scheme: BLUES, 
        reverse: true
      },
      x: {axis: null},
      y: {
        axis: null, 
        range: [30, 3]
      }, 
    }), {
      fill: DARK_BLUE
    });
}

function histogram(data, col, type = CONTINUOUS) {
  // compute color + mean
  const barColor = colorMap.get(type).brighter;
  const mean = d3.mean(data, d => d[col]);
  
  // formatter for the mean
  const extent = d3.extent(data, d => d[col]);
  const format = type === DATE ? getDateFormat(extent) : d3.format(',.0f');
  const rules = [{
    label: MEAN, 
    value: mean
  }];

  return addTooltips(
    Plot.plot({
      width: 240,
      height: 55,
      style: {
        display: INLINE_BLOCK,
        width: '240px'
      },
      x: {
        label: '',
        ticks: extent,
        tickFormat: format
      }, 
      y: {
        axis: null
      },     
      marks: [
        Plot.rectY(data, 
          Plot.binX({
              y: COUNT, 
              title: (elems) => {
                // compute range for the elements
                const barExtent = d3.extent(elems, d => d[col]);
                const barFormat = type === DATE ? getDateFormat(barExtent) : d3.format(',.0f');
                return `${elems.length} rows\n[${barFormat(barExtent[0])} to ${barFormat(barExtent[1])}]`;
              }
            }, {
              x: col, 
              fill: barColor
            })
        ), 
        Plot.ruleY([0]), 
        Plot.ruleX(rules, {
          x: 'value', 
          strokeWidth: 2, 
          title: d => `${d.label} ${col}: ${format(d.value)}`
        })
      ], 
      style: {
        marginLeft: -17,
        background: NONE,
        overflow: VISIBLE
      }
    }), {
      opacity: 1, 
      fill: colorMap.get(type).color
    });
}


/**
 * Adds chart toolitps.
 * @param {*} chart 
 * @param {*} hoverStyles 
 * @returns 
 */
function addTooltips(chart, hoverStyles = {fill: BLUE, opacity: 0.5 }) {
  // add the hover group
  // workaround if it's in a figure
  const type = d3.select(chart).node().tagName;
  const wrapper =  (type === 'FIGURE') ? d3.select(chart).select('svg') : d3.select(chart);
  wrapper.style('overflow', VISIBLE); // to avoid clipping at the edges
  wrapper.selectAll('path').style('pointer-events', 'visibleStroke'); // only trigger hover for lines in visible area

  const tip = wrapper
    .selectAll('.hover-tip')
    .data([''])
    .join('g')
    .attr('class', 'hover')
    .style('pointer-events', NONE)
    .style('text-anchor', 'middle');

  // create a unique id for the chart for styling
  const id = idGenerator();

  // add chart event listeners to display tooltips
  d3.select(chart)
    .classed(id, true) // using a class selector so that it doesn't overwrite the ID
    .selectAll('title')
    .each(function () {
      // get the text out of the title, set it as an attribute on the parent, and remove it
      const title = d3.select(this); // title element that we want to remove
      const parent = d3.select(this.parentNode); // visual mark on the screen
      const t = title.text();
      if (t) {
        parent.attr('__title', t).classed('has-title', true);
        title.remove();
      }

      // add mouse events
      parent
        .on('mousemove', function (event) {
          const text = d3.select(this).attr('__title');
          const pointer = d3.pointer(event, wrapper.node());
          if (text) tip.call(hover, pointer, text.split('\n'));
          else tip.selectAll('*').remove();

          // keep within the parent horizontally
          const tipSize = tip.node().getBBox();
          if (pointer[0] + tipSize.x < 0)
            tip.attr(
              'transform',
              `translate(${tipSize.width / 2}, ${pointer[1] + 7})`
            );
          else if (pointer[0] + tipSize.width / 2 > wrapper.attr('width'))
            tip.attr(
              'transform',
              `translate(${wrapper.attr("width") - tipSize.width / 2}, ${
                pointer[1] + 7
              })`
            );
        })
        .on('mouseout', (event) => {
          tip.selectAll('*').remove();
        });
    });

  // remove tooltip when user taps on the wrapper on mobile devices
  wrapper.on('touchstart', () => tip.selectAll('*').remove());
  // add styles
  const styleString = Object.keys(hoverStyles)
    .map((d) => {
      return `${d}: ${hoverStyles[d]};`;
    })
    .join('');

  // Define the styles
  const style = html`<style>
    .${id} .has-title {
       cursor: pointer; 
       pointer-events: all;
    }
    .${id} .has-title:hover {
      ${styleString}
    }
  </style>`;
  chart.appendChild(style);
  return chart;
}

/**
 * Positions tooltip display.
 * @param {*} tip 
 * @param {*} pos 
 * @param {*} text 
 */
function hover(tip, pos, text) {
  const sidePadding = 10;
  const verticalPadding = 5;
  const verticalOffset = 15;

  // clear tooltip
  tip.selectAll('*').remove();

  // add text
  tip.style('text-anchor', 'middle')
    .style('pointer-events', NONE)
    .attr('transform', `translate(${pos[0]}, ${pos[1] + 7})`)
    .selectAll('text')
    .data(text)
    .join('text')
    .style('dominant-baseline', 'ideographic')
    .text((d) => d)
    .attr('y', (d, i) => (i - (text.length - 1)) * 15 - verticalOffset)
    .style('font-weight', (d, i) => (i === 0 ? 'bold' : 'normal'));

  const bbox = tip.node().getBBox();

  // add background rectangle
  tip.append('rect')
    .attr('y', bbox.y - verticalPadding)
    .attr('x', bbox.x - sidePadding)
    .attr('width', bbox.width + sidePadding * 2)
    .attr('height', bbox.height + verticalPadding * 2)
    .style('fill', 'var(--vscode-editor-background)')
    .style('stroke', 'var(--vscode-panel-border)')
    .lower();
}

const idGenerator = () => {
  var S4 = function () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  };
  return "a" + S4() + S4();
};

/**
 * Gets UTC date format with offset.
 * @param extent Time offset.
 * @returns 
 */
function getDateFormat(extent) {
  const formatMillisecond = d3.utcFormat('.%L'),
      formatSecond = d3.utcFormat(':%S'),
      formatMinute = d3.utcFormat('%I:%M'),
      formatHour = d3.utcFormat('%I %p'),
      formatDay = d3.utcFormat('%a %d'),
      formatWeek = d3.utcFormat('%b %d'),
      formatMonth = d3.utcFormat('%B'),
      formatYear = d3.utcFormat('%Y');

  // test the difference between extent, offset by 1
  return extent[1] > d3.utcYear.offset(extent[0], 1)? formatYear :
    extent[1] > d3.utcMonth.offset(extent[0], 1)? formatMonth :
    extent[1] > d3.utcWeek.offset(extent[0], 1) ? formatWeek :
    extent[1] > d3.utcDay.offset(extent[0], 1) ? formatDay :
    extent[1] > d3.utcHour.offset(extent[0], 1) ? formatHour :
    extent[1] > d3.utcMinute.offset(extent[0], 1) ? formatMinute :
    extent[1] > d3.utcSecond.offset(extent[0], 1) ? formatSecond :
    extent[1] > d3.utcMillisecond.offset(extent[0], 1) ? formatMillisecond :
    formatDay;
}

function dateFormat(date) {
  const formatMillisecond = d3.timeFormat('.%L'),
    formatSecond = d3.timeFormat(':%S'),
    formatMinute = d3.timeFormat('%I:%M'),
    formatHour = d3.timeFormat('%I %p'),
    formatDay = d3.timeFormat('%a %d'),
    formatWeek = d3.timeFormat('%b %d'),
    formatMonth = d3.timeFormat('%B'),
    formatYear = d3.timeFormat('%Y');
  
  return (d3.timeSecond(date) < date ? formatMillisecond
      : d3.timeMinute(date) < date ? formatSecond
      : d3.timeHour(date) < date ? formatMinute
      : d3.timeDay(date) < date ? formatHour
      : d3.timeMonth(date) < date ? (d3.timeWeek(date) < date ? formatDay : formatWeek)
      : d3.timeYear(date) < date ? formatMonth
      : formatYear)(date);
}

// summary table SVG icons
const icons = ({
  ordinal: () => html`<div style="display:inline-block; border-radius:100%; width: 16px; height: 16px; background-color: ${colorMap.get("ordinal").color}; transform: scale(1.3); vertical-align: middle; align-items: center;margin-right:8px;}">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="2" height="2" fill="white"/>
    <rect x="7" y="4" width="6" height="2" fill="white"/>
    <rect x="4" y="7" width="2" height="2" fill="white"/>
    <rect x="7" y="7" width="6" height="2" fill="white"/>
    <rect x="4" y="10" width="2" height="2" fill="white"/>
    <rect x="7" y="10" width="6" height="2" fill="white"/>
  </svg>
</div>`,
  date: () => html`<div style="display:inline-block; border-radius:100%; width: 16px; height: 16px; background-color: ${colorMap.get("date").color}; transform: scale(1.3); vertical-align: middle; align-items: center;margin-right:8px;}">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="5" width="8" height="1" fill="white"/>
    <rect x="5" y="4" width="2" height="1" fill="white"/>
    <rect x="9" y="4" width="2" height="1" fill="white"/>
    <rect x="4" y="7" width="8" height="5" fill="white"/>
  </svg>
</div>`,
  continuous: () => html`<div style="display:inline-block; border-radius:100%; width: 16px; height: 16px; background-color: ${colorMap.get("continuous").color}; transform: scale(1.3); vertical-align: middle; align-items: center;margin-right:8px;}">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="12" width="4" height="2" transform="rotate(-90 4 12)" fill="white"/>
    <rect x="7" y="12" width="6" height="2" transform="rotate(-90 7 12)" fill="white"/>
    <rect x="10" y="12" width="8" height="2" transform="rotate(-90 10 12)" fill="white"/>
  </svg>
</div>`
});
