var winston = require('../../../logger')

const apiIssues = {}

apiIssues.create = function (req, res) {
  const IssueSchema = require('../../../models/issue')
  const issueSchema = req.body
  winston.warn('Public account creation was attempted while disabled!',issueSchema)

    // Issue Creation
    const issue = new IssueSchema({ 
      ...issueSchema
    })

    issue.save(function (err, issue) {
    if (err) return res.status(400).json({ success: false, error: 'Error: ' + err.message })

    res.json({ success: true, error: null, issue: issue })
  })
    
}

module.exports = apiIssues