const { v4: uuidv4 } = require('uuid');

const generateShortOrderId = () => {
    const uuid = uuidv4().replace(/-/g, '').slice(0, 6); 
    return `#ID-${uuid}`;
};

module.exports.generateShortOrderId = generateShortOrderId;
