const b = require('ast-node-builder');

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

    case 'MemberExpression':
      str = b.memberExpression(node);
      break;

    default:
      console.log('buildNode => ', node.type);
      break;
  }

  return str;

}

function isValidNode(node) {
  let bValidNode = node.type 
    && node.type !== 'Identifier' 
    && node.type !== 'Literal';
  return bValidNode ? true : false;
}

function getParentPath(path) {
  // Slicing the last element in array to reach the parent
  return path.slice(0, -1);
}

module.exports = { 
  buildNode,
  isValidNode,
  getParentPath
};
