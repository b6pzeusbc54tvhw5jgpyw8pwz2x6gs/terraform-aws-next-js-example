const {generate} = require('generate-password')

module.exports = {
  generateBuildId: () => {
    // You can, for example, get the latest git commit hash here
    return generate({ length: 8, numbers: true, symbols: false, excludeSimilarCharacters: true })
  },
}
