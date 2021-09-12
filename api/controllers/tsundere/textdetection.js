'use strict';

const vision = require('@google-cloud/vision');
const sharp = require('sharp');
//const fs = require('fs').promises;

class TextDetection{
  constructor(){
    this.client = new vision.ImageAnnotatorClient();
  }

  async detection(target_buffer, template){
    try {
      var sample = await sharp(target_buffer);
      var metadata = await sample.metadata();
      console.log(metadata);
      var ratio = metadata.width / template.image_width;
      console.log("ratio=" + ratio);

      const positionMask = Buffer.from(
        `<svg width="${metadata.width}" height="${metadata.height}" >
          <rect x="${Math.round(template.base_range.x * ratio)}" y="0" width="${Math.round(template.base_range.width * ratio)}" height="${metadata.height}" />
        </svg>`
      );

      var sample_buffer = await sample
        .sharpen(20)
        .composite([{
          input: positionMask,
          blend: 'dest-in',
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();

      const [position_result] = await this.client.textDetection(sample_buffer);
      var position_allResult = parse_paragraph(position_result.fullTextAnnotation, template);

      var base_position = position_allResult.find(item => item.str == template.base_range.value);
      if (!base_position) {
        console.log('not found');
        return [];
      }
      var offset = Math.round((base_position.max_y + base_position.min_y) / 2 / ratio - (template.base_range.y + template.base_range.height / 2));
      console.log("offset=" + offset);

      const targetMask = make_mask(template.ranges, offset, template);
//      var range = await sharp(targetMask).png().toBuffer();
//      fs.writeFile("./range.png", range);

      var masked_buffer = await sharp(target_buffer)
        .resize(template.image_width)
        .sharpen(20)
        .composite([{
          input: targetMask,
          blend: 'dest-in',
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();
//      fs.writeFile("./result.png", masked_buffer);

      const [result] = await this.client.textDetection(masked_buffer);
      var allResult = parse_paragraph(result.fullTextAnnotation, template);

      allResult.forEach(item => {
        var found = template.ranges.find(range => {
          var center_x = Math.round((item.min_x + item.max_x) / 2);
          var center_y = Math.round((item.min_y + item.max_y) / 2);
          return (center_x >= range.x && center_x <= (range.x + range.width)) &&
            (center_y >= (range.y + offset) && center_y <= (range.y + offset + range.height))
        });
        if (found)
          item.range = found
      });
      console.log("allResult=", JSON.stringify(allResult));

      return allResult;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

function make_mask(ranges, offset, template) {
  var svg = `<svg width="${template.image_width}" height="${template.image_height}">`;
  for (var range of ranges) {
    svg += `<rect x="${range.x}" y="${range.y + offset}" width="${range.width}" height="${range.height}" />`
  }
  svg += `</svg>`;
  return Buffer.from(svg);
}

function parse_paragraph(annotation, template) {
  if (!annotation || !annotation.pages || annotation.pages.length < 1)
    return [];

  var result = [];
  var blocks = annotation.pages[0].blocks;
  for (var block of blocks) {
    for (var para of block.paragraphs) {
      var str = "";
      var min_x = template.image_width, max_x = -1, min_y = template.image_height, max_y = -1;
      for (var word of para.words) {
        for (var symbol of word.symbols) {
          str += symbol.text;
          for (var vertices of symbol.boundingBox.vertices) {
            if (vertices.x < min_x) min_x = vertices.x;
            if (vertices.x > max_x) max_x = vertices.x;
            if (vertices.y < min_y) min_y = vertices.y;
            if (vertices.y > max_y) max_y = vertices.y;
          }
        }
      }
      if (str != "")
        result.push({ str, min_x, min_y, max_x, max_y });
    }
  }

  return result;
}

module.exports = new TextDetection();
