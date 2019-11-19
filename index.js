const recast = require('recast');
const debug = require('debug')('jarvis');
const diff = require('deep-diff').diff;
const R = require('ramda');


const transformLogic = '';
const transformTemplate = `
export default function transformer(file, api) {
  const j = api.jscodeshift;

  const root = j(file.source);
  const body = root.get().value.program.body;

  ${transformLogic}

  return root.toSource();
}
`;
const input =  `hello()`;
const output =  `hello(1,2)`;

const inputast = recast.parse(input);
const outputast = recast.parse(output);

const differences = diff(inputast, outputast, {
  prefilter: function(path, key) {
    return ~['loc', 'tokens'].indexOf(key);
  }
});

debug('differences', differences);

function buildNewNodes(node) {

  let str = '';
  switch(node.type) {
    case 'Literal':
      str = `j.literal(node.value)`;
      break;

    default:
      console.log('buildNewNodes => ', node.type);
      break;
  }
  return str;
}

function genArrayDiff(diff, path) {
  let str = '';
  debug('genArrayDiff::diff.item', diff.item);
  switch(diff.item.kind) {
    case 'N': // New item in Array
      debug('genArrayDiff::diff.item.rhs', diff.item.rhs);
      let node = R.path(diff.path, inputast);
      node.push(diff.item.rhs);
      str = `
      .forEach(path => {
        ${buildNewNodes(diff.item.rhs)}
      });`;
      break;

    default:
      console.log('genArrayDiff => ', diff.kind);
      break;
  }

  return str.join(',');
}

function isValidNode(node) {
  return node.type ? true : false;
}

function getParentPath(path) {
  // Slicing the last element in array to reach the parent
  return path.slice(0, -1);
}

// find the node
function createFilter(node, newNode) {
  let filter = '';
  switch(node.type) {
    case 'CallExpression':
      filter = `root.find(j.CallExpression, {
      callee: { name: '${node.callee.name}' }
      })
      .forEach(path => {
        path.arguments.push(j.literal(1));
        path.arguments.push(j.literal(1));
      });
      `;
      break;

    default:
      console.log('createFilter => ', node.type);
      break;



  }

  return filter;
}

function generateTransform(differences) {
  return differences.map(diff => {

    switch(diff.kind) {
      case 'A': // Array diff
        debug('generateTransform::diff.path', diff.path);
        debug('generateTransform::isValidNode(diff.path)',isValidNode(R.path(diff.path, inputast)));
        if(isValidNode(R.path(diff.path, inputast))) {

          let filter = createFilter(R.path(diff.path, inputast));
          debug('generateTransform::filter', filter);
        } else {

          let parentPath = getParentPath(diff.path);
          if(isValidNode(R.path(parentPath, inputast))) {

            let filter = createFilter(R.path(parentPath, inputast), R.path(parentPath,outputast));
            console.log( filter);
          }
        }

        return genArrayDiff(diff);

      default:
        console.log('generateTransform => ', diff.kind);
        return '';


    }
  }).join('\n');
}

generateTransform(differences);

console.log(recast.print(inputast).code);

