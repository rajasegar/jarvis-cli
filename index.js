'use strict';

const recast = require('recast');
const debug = require('debug')('jarvis');
const diff = require('deep-diff').diff;
const R = require('ramda');
const b = require('ast-node-builder');



const input =  `
foo.bar.baz()
`;
const output =  `
foo.bar.baz(3)
`;

const inputAst = recast.parse(input);
const outputAst = recast.parse(output);

const differences = diff(inputAst, outputAst, {
  prefilter: function(path, key) {
    return ~['loc', 'tokens'].indexOf(key);
  }
});

console.log('differences', differences);

function isValidNode(node) {
  return node.type ? true : false;
}

function getParentPath(path) {
  // Slicing the last element in array to reach the parent
  return path.slice(0, -1);
}

function buildNode(node) {
  let str =  '';
  switch(node.type) {
    case 'CallExpression':
      str =  b.callExpression(node);
      break;

    case 'Identifier':
      str = b.identifier(node);
      break;

    case 'Literal':
      str = b.literal(node);
      break;

    default:
      console.log('buildNode => ', node.type);
      break;
  }

  return str;

}

// Build object query
function objectQuery(node) {
  let str = '';
  switch(node.type) {
    case 'Identifier':
      str = ` object: { name: '${node.name}' } `;
      break;

    case 'CallExpression':
      str = ` object: { ${calleeQuery(node.callee)} }, `;
      break;

    case 'MemberExpression':
      str = ` object: {  ${objectQuery(node.object)} ,
        property: { name: '${node.property.name}' }
        } `;

    default:
      console.log('objectQuery::object => ', node.type);
      break;
  }

  return str;
}

// Build callee query
function calleeQuery(node) {
  console.log(node.type);
  let str = '';
  if(node.type === 'MemberExpression') {
    let { object, property } = node;
    let obj = '';
    let prop = '';

    obj = objectQuery(object);
    //switch(object.type) {
      //case 'Identifier':
        //obj = ` object: { name: '${object.name}' } `;
        //break;

      //case 'CallExpression':
        //obj = `
        //object: { ${calleeQuery(object.callee)} },
        //property: { name: '${property.name}' },
        //`;
        //break;

      //case 'MemberExpression':
        //obj = `
        //object: { ${objectQuery(object.object)} },
        //property: { name: '${property.name}' },
        //`;

      //default:
        //console.log('calleeQuery::object => ', object.type);
        //break;
    //}

    switch(property.type) {
      case 'Identifier':
        prop = `property: { name: '${property.name}' }`;
        break;

      default:
        console.log('calleeQuery::property => ', property.type);
        break;
    }

    str =  `callee: {
    ${obj},
    ${prop}
  }`;

  } else if (node.type === 'CallExpression') {
    str = ` callee: ${calleeQuery(node.callee)} `;

  } else if (node.type === 'Identifier') {

    str = ` callee: { name: '${node.name}' } `;
  }
  else {

    console.error('Unknown node type in calleeQuery');
  }

  return str;

}

// Build callExpression query
function buildCallExpressionQuery(node) {
  let str = '';
  switch(node.callee.type) {
    case 'Identifier':
      str = `root.find(j.CallExpression, {
      ${calleeQuery(node.callee)} 
      })`;
      break;

    case 'MemberExpression':
      str = `root.find(j.CallExpression, {
      ${calleeQuery(node.callee)} 
      })`;
      break;

    default:
      console.log('buildCallExpressionQuery => ', node.callee.type);
      break;
  }
  return str;
}
// Build the jscodeshift find query from nodes
function buildFindQuery(node) {
  let str = '';
  switch(node.type) {
    case 'CallExpression':
      str = buildCallExpressionQuery(node);       
      break;

    case 'MemberExpression':
      str = `root.find(j.MemberExpression, {
      object: { callee: { name: '${node.object.callee.name}' } },
      property: { name: '${node.property.name}' }
      })`;
      break;

    default:
      break;

  }

  return str;

}


// find the node
function findAndReplace(node, newNode) {
  let filter = '';
  switch(node.type) {
    case 'CallExpression':
      filter = `${buildFindQuery(node)}      
      .replaceWith(path => {
      return ${buildNode(newNode)}
      });
      `;
      break;

    case 'MemberExpression':
      filter = `${buildFindQuery(node)}      
      .replaceWith(path => {
      return ${buildNode(newNode)}
      });
      `;
      break;

    case 'Literal':
      filter = `root.find(j.literal, {
      name: ${node.name},
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
      filter = `${buildFindQuery(node)}      
      .remove()`;
      break;

    case 'MemberExpression':
      filter = `${buildFindQuery(node)}      
      .remove()`;
      break;

    case 'Literal':
      filter = `${buildFindQuery(node)}      
      .remove()`;
      break;


    default:
      console.log('findAndReplace => ', node.type);
      break;
  }

  return filter;
}

function generateTransform(differences) {
  let transformLogic = differences.map(diff => {

    let _path = isValidNode(diff.path) ? diff.path : getParentPath(diff.path);
    let str = '';
    switch(diff.kind) {
      case 'A': // Array diff
        str = findAndReplace(R.path(_path, inputAst), R.path(_path,outputAst));
        break;


      case 'E':
        str = findAndReplace(R.path(_path, inputAst), R.path(_path, outputAst));
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


