
const getProfile =  (req, res, next) => {
    const {Profile} = req.app.get('models')
    const profile = Profile.findOne({where: {id: req.get('profile_id') || 0}})
    if (!profile) return res.status(401).end()
    req.profile = profile
    next()
}
module.exports = {getProfile}