#!/usr/bin/env node
'use strict';

const recast = require('recast');
const diff = require('deep-diff').diff;
const R = require('ramda');
const { 
  buildNode,
  isValidNode,
  getParentPath
} = require('./lib/utils.js');

const {
  findQuery
} = require('./lib/query.js');



const input =  `
Ember.propertyWillChange(object, 'someProperty');
doStuff(object);
Ember.propertyDidChange(object, 'someProperty');
`;
const output =  `
doStuff(object);
Ember.notifyPropertyChange(object, "someProperty");
`;

const inputAst = recast.parse(input);
const outputAst = recast.parse(output);

const differences = diff(inputAst, outputAst, {
  prefilter: function(path, key) {
    return ~['loc', 'tokens', 'raw'].indexOf(key);
  }
});

console.log('differences', differences);

// find the node
function findAndReplace(node, newNode) {
  let filter = '';
  switch(node.type) {
    case 'CallExpression':
      filter = `${findQuery(node)}      
      .replaceWith(path => {
      return ${buildNode(newNode)}
      });
      `;
      break;

    case 'MemberExpression':
      filter = `${findQuery(node)}      
      .replaceWith(path => {
      return ${buildNode(newNode)}
      });
      `;
      break;

    case 'Literal':
      filter = `root.find(j.Literal, {
      name: '${node.value}',
      })
      .replaceWith(path => {
      return ${buildNode(newNode)}
      });
      `;
      break;

    case 'Identifier':
      filter = `root.find(j.Identifier, {
      name: '${node.name}',
      })
      .replaceWith(path => {
      return ${buildNode(newNode)}
      });
      `;
      break;



    default:
      console.log('findAndReplace => ', node.type);
      break;
  }

  return filter;
}

// Find the node and remove
function findAndRemove(node) {

  let filter = '';
  switch(node.type) {
    case 'CallExpression':
      filter = `${findQuery(node)}      
      .remove()`;
      break;

    case 'MemberExpression':
      filter = `${findQuery(node)}      
      .remove()`;
      break;

    case 'Literal':
      filter = `${findQuery(node)}      
      .remove()`;
      break;


    default:
      console.log('findAndReplace => ', node.type);
      break;
  }

  return filter;
}

function findValidParentPath(path, ast) {
  let _path  = path;
  while(!isValidNode(R.path(_path,ast))) {
    _path = getParentPath(_path);
  }
  return _path;
}
function newArguments(diff) {
  let str = '';
  let { index, item, path } = diff;
  let _path = getParentPath(path);
  let query = findQuery(R.path(_path, inputAst));

  // Insert at index-1 using array.splice
  str = `${query}
    .forEach(path => {
    path.value.arguments.splice(${index}, 0, ${buildNode(item.rhs)});
    });`;
  
  return str;
}

// Build object access path 
// buildPath(['a','b','c']) => a.b.c
function buildPath(items) {
  return items.map(i => typeof i  === 'number' ? `[${i}]` : i)
    .join('.')
    .replace('.[', '[');
}

// Replace value in ast node
function replaceValue(diff, ast) {
  let str = '';
  let _path =  findValidParentPath(diff.path, ast);
  let newPath = R.difference(diff.path, _path);
  let newValue = typeof diff.rhs === 'number' ? diff.rhs : `'${diff.rhs}'`;
  str = `
    ${findQuery(R.path(_path, ast))}
    .forEach(path => {
    ${buildPath(['path','value', ...newPath])} = ${newValue};

    });`;
  return str;
}
function generateTransform(differences) {
  let transformLogic = differences.map(diff => {

    let _path = isValidNode(diff.path) ? diff.path : getParentPath(diff.path);
    let str = '';
    switch(diff.kind) {
      case 'A': // Array diff
        str  = newArguments(diff);
        break;

      case 'E':
        if(R.last(diff.path) === 'value' 
         || R.last(diff.path) === 'name' 
        ) {
          // Replace value
          str = replaceValue(diff, inputAst);
        } else {
                str = findAndReplace(R.path(_path, inputAst), R.path(_path, outputAst));
        }
        break;

      case 'D':
        str = findAndRemove(R.path(_path, inputAst));
        break;

      default:
        console.log('generateTransform => ', diff.kind);
        break;
    }

    return str;
  }).join('\n');

  const transformTemplate = `
export default function transformer(file, api) {
  const j = api.jscodeshift;

  const root = j(file.source);
  const body = root.get().value.program.body;

  ${transformLogic}

  return root.toSource();
}
`;

  return transformTemplate;
}


let codemod = generateTransform(differences);
console.log(codemod);


