import * as d3 from 'd3'
import { debounce } from 'debounce'
import * as topojson from 'topojson'

const margin = {
  top: 30,
  right: 20,
  bottom: 30,
  left: 30
}

const width = 600 - margin.left - margin.right
const height = 600 - margin.top - margin.bottom

const svg = d3
  .select('#map_chart')
  .append('svg')
  .attr('width', width + margin.left + margin.right)
  .attr('height', height + margin.top + margin.bottom)
  .append('g')
  .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

let projection = d3.geoMercator()
let path = d3.geoPath().projection(projection)

const colorScale = d3
  .scaleOrdinal()
  .range([
    'red',
    'purple',
    'blue'
  ])

var div = d3
  .select('body')
  .append('div')
  .attr('class', 'tooltip')
  .style('opacity', 0)

Promise.all([
  d3.json(require('./data/missouri.topojson')),
  d3.csv(require('./data/mo_birth_only_pols.csv'))
])
  .then(ready)
  .catch(err => console.log('Failed on', err))

function ready ([json, datapoints]) {
  //console.log(json.objects)
  let counties = topojson.feature(json, json.objects.missouri_export)
  projection.fitSize([width, height], counties)

  //console.log('Datapoints look like', datapoints)

  var cityList = ['St. Louis',
    'Sikeston',
    'Columbia',
    'Independence',
    'Jefferson City',
    'Springfield',
    'Houston']

  var pronunciationList = [
    'Missour-ee',
    'Both',
    'Missour-ah']

  var defs = svg.append('defs')


//this controls the outline (i.e., stroke) of the MO counties
  svg
    .selectAll('.counties')
    .data(counties.features)
    .enter()
    .append('path')
    .attr('class', 'counties')
    .attr('d', path)
    .attr('stroke', 'white')
    .attr('fill', '#d3d3d3')


//this shows where the cities in the cityList are located in MO, for refernce
  svg
    .selectAll('.label')
    .data(counties.features)
    .enter()
    .append('text')
    .attr('class', d => {
        //console.log (d.properties.cnty_seat)
      return d.properties.cnty_seat.replace(/\s+/g, '-').toLowerCase()
    })
    .classed('label', true)
    .text(d => {
      if (cityList.indexOf(d.properties.cnty_seat) !== -1) {
        return '●' + d.properties.cnty_seat
      }
    })
    .attr('transform', d => {
      let coords = projection(d3.geoCentroid(d))
      return `translate(${coords})`
    })
    .attr('text-anchor', 'right')
    .attr('alignment-baseline', 'middle')
    .style('visibility', 'hidden')
    .attr('font-size', 3)

  defs
    .selectAll('.person-pattern')
    .data(datapoints)
    .enter()
    .append('pattern')
    .attr('class', 'artist-pattern')
    .append('pattern')
    .attr('id', function(d) {
      return d.name_elected.toLowerCase().replace(/ /g, '-')
    })
    .attr('height', '100%')
    .attr('width', '100%')
    .attr('patternContentUnits', 'objectBoundingBox')
    .append('image')
    .attr('height', '1')
    .attr('width', '1')
    .attr('preserveAspectRatio', 'none')
    .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    .attr('xlink:href', function(d) {
      return d.image_path
    })



  svg
    .selectAll('.circle')
    .data(datapoints)
    .enter()
    .append('circle')
    .attr('class', d => {
      var str = d['name_elected'].replace(/[\(\)]/g, ' ')
      return str.replace(/\s+/g, '-').toLowerCase()
    })
    .classed('pol', true)
    .attr('transform', d => {
      let coords = projection([d.longitude, d.latitude])
      //console.log(`(${coords})`)
      return `translate(${coords})`
    })
    .attr('stroke', 'white')
    .attr('stroke-width', 2)
   .attr('fill', function(d) {
      return 'url(#' + d.name_elected.toLowerCase().replace(/ /g, '-') + ')'
    })
    .attr('visibility', 'visible')
    .on('mouseover', function (d) {
      d3.select(this)
        .raise()
        .transition()
        .duration(100)
        .attr('r', 25)
        .attr('stroke', d => {
        if (d['party'] === 'D') {
          return '#2f36c8'
        } else {
          return '#e9412b'
        }
      })
        .attr('stroke-width', 3)
        .style('opacity', 1)

      div
        .transition()
        .duration(100)
        .style('opacity', 1)

      div
        .html('<strong>' + 'Politician: ' + '</strong>' + d.name_elected + ' (' + d.party + '-MO)' + '<br>' +
              '<strong>' + 'Office: ' + '</strong>' + d.position  + '<br>' +
              '<strong>' + 'Hometown: ' + '</strong>' + d.hometown + '<br>' +
              '<strong>' + 'Pronunciation: ' + '</strong>' + '"' + d.pronunciation + '"')
        .style('left', d3.event.pageX + 20 + 'px')
        .style('top', d3.event.pageY - 28 + 'px')
    })
    .on('mouseout', function (d) {
      d3.select(this)
        .transition()
        .duration(150)
        .attr('r', 20)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .style('opacity', 1)

      div
        .transition()
        .duration(150)
        .style('opacity', 0)
    })
  svg
    .append('filter')
    .attr('id', 'desaturate')
    .append('feColorMatrix')
    .attr('type', 'matrix')
    .attr('fill-opacity', 1)
    .attr('brightness', '500%')
    .attr('contrast', '20%')
    .attr('values', '0.7 0.7 0.7 0 0 0.7 0.7 0.7 0 0 0.7 0.7 0.7 0 0 0 0 0 1 0')

d3.select('#blankMO').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', 'visible')
      .attr('r', 20)

    svg
      .selectAll('.label')
      .style('visibility', 'visible')
      .transition()
      .duration(200)
      .attr('opacity', 1)
  })

//dems who say missouree (including those who say both)
 d3.select('#pol1').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', d => {
        if (d['party'] === 'D') {
          return 'visible'
        } else {
          return 'hidden'
        }
      })
      .attr('filter', d => {
        if (d['pronunciation'] == 'Missour-ee') {
          return 'none'
        } else if (d['pronunciation'] === 'Both') {
          return 'none'
        } else {
          return 'url(#desaturate)'
        } 
      })
    svg
      .selectAll('.label')
      .transition()
      .duration(200)
      .attr('opacity', 1)
    })

//dems who say missourah (including those who do both)
d3.select('#pol2').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', d => {
        if (d['party'] === 'D') {
          return 'visible'
        } else {
          return 'hidden'
        }
      })
      .attr('filter', d => {
        if (d['pronunciation'] == 'Missour-ah') {
          return 'none'
        } else if (d['pronunciation'] === 'Both') {
          return 'none'
        } else {
          return 'url(#desaturate)'
        } 
      })
    svg
      .selectAll('.label')
      .transition()
      .duration(200)
      .attr('opacity', 1)
    })

  // Everyone who says Both
  d3.select('#pol3').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', 'visible')
      .attr('filter', d => {
        if (d['pronunciation'] === 'Both') {
          return 'none'
        } else {
          return 'url(#desaturate)'
        }
      })
    svg
      .selectAll('.label')
      .transition()
      .duration(200)
      .attr('opacity', 1)
      })

  // Republicans who say Missour-ee, including those who use both
  d3.select('#pol4').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', d => {
        if (d['party'] === 'R') {
          return 'visible'
        } else {
          return 'hidden'
        }
      })
      .attr('filter', d => {
        if (d['pronunciation'] == 'Missour-ee') {
          return 'none'
        } else if (d['pronunciation'] === 'Both') {
          return 'none'
        } else {
          return 'url(#desaturate)'
        } 
      })
    svg
      .selectAll('.label')
      .transition()
      .duration(200)
      .attr('opacity', 1)
    })

  // Republicans who say Missourah
  d3.select('#pol5').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', d => {
        if (d['party'] === 'R') {
          return 'visible'
        } else {
          return 'hidden'
        }
      })
      .attr('filter', d => {
        if (d['pronunciation'] == 'Missour-ah') {
          return 'none'
        } else if (d['pronunciation'] === 'Both') {
          return 'none'
        } else {
          return 'url(#desaturate)'
        } 
      })
    svg
      .selectAll('.label')
      .transition()
      .duration(200)
      .attr('opacity', 1)
    })

  // House members who say both
 d3.select('#pol6').on('stepin', () => {
    svg
      .selectAll('.pol')
      .style('visibility', d => {
        if (d['position'] === 'U.S. House of Representatives') {
          return 'visible'
        } else {
          return 'hidden'
        }
      })
      .transition()
      .duration(200)
      .attr('opacity', 1)
      .attr('filter', d => {
        if (d['pronunciation'] === 'Both') {
          return 'none'
        } else {
          return 'url(#desaturate)' 
        }
      })
  })

  //Make it responsive
  function render () {
    // Calculate height/width
    console.log('Rendering')
    let screenWidth = svg.node().parentNode.parentNode.offsetWidth
    let screenHeight = window.innerHeight
    // let screenHeight = window.innerHeight
    // let screenWidth = svg.node().parentNode.parentNode.offsetWidth
    let newWidth = screenWidth - margin.left - margin.right
    let newHeight = screenHeight - margin.top - margin.bottom

    // Update your SVG
    let actualSvg = d3.select(svg.node().parentNode)
    actualSvg
      .attr('height', newHeight + margin.top + margin.bottom)
      .attr('width', newWidth + margin.left + margin.right)

    projection.fitSize([newWidth, newHeight], counties)

    svg
      .selectAll('.counties')
      .attr('d', path)
    svg
      .selectAll('.label')
      .attr('transform', d => `translate(${path.centroid(d)})`)

    svg
      .selectAll('.pol')
      .attr('transform', d => {
        let coords = projection([d.longitude, d.latitude])
        return `translate(${coords})`
      })

    // If it's really small, resize the circle size
    if (newHeight < 400) {
      svg.selectAll('.pol').attr('cx', 1).attr('cy', 1).attr('r', 15)
    } else {
      svg.selectAll('.pol').attr('cx', 3).attr('cy', 3).attr('r', 20)
    }

    if (newWidth < 200) {
      svg.selectAll('.pol').attr('cx', 1).attr('cy', 1).attr('r', 15)
    } else {
      svg.selectAll('.pol').attr('cx', 3).attr('cy', 3).attr('r', 20)
    }
  }

  window.addEventListener('resize', debounce(render, 400))
  render()
}