const express = require('express');
const bodyParser = require('body-parser');
const { Op, json } = require("sequelize");
const {sequelize, Contract} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * @returns Contract only if it belongs to the profile calling
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const contract = await Contract.findOne({
        where: {id, ClientId: req.profile.get('id')}
    });
    if (!contract) return res.status(404).end()
    res.json(contract)
});

/**
 * @returns List of contracts belonging to a user (client or contractor), the list should only contain non terminated contracts.
 */
app.get('/contracts', getProfile, async(req, res) => {
    const {Contract} = req.app.get('models')
    const contracts = await Contract.findAll({
        where: {
            [Op.or]: [{status: 'new'}, {status: 'in_progress'}],
            [Op.and]: [{ClientId: req.profile.get('id')}]
        }
    })
    res.json(contracts)
});

/**
 * @returns Get all unpaid jobs for a user (either a client or contractor), for active contracts only.
 */
app.get('/jobs/unpaid', getProfile, async(req, res) => {
    const{Job, Contract} = req.app.get('models');
    const jobs = await Job.findAll({
        where: {paid: null},
        include: [{
            model: Contract,
            where: {status: 'in_progress', ClientId: req.profile.get('id')}
        }]
    });
    res.json(jobs)
});

/**
 * @requires job id to pay
 * @returns Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
 */
app.post('/jobs/:job_id/pay', getProfile, async(req, res) => {
    const {Job, Contract, Profile} = req.app.get('models');
    const {job_id} = req.params;
    const job = await Job.findOne({
        where: {id: job_id, paid: null},
        include: [{
            model: Contract,
            where: {ClientId: req.profile.get('id')}
        }]
    });
    if(!job) return res.status(404).end()
    const currentBalance = req.profile.get('balance');
    if (job.price <= currentBalance) {
        req.profile.balance = currentBalance - job.price;
        /*req.profile.save(function(err) {
            if (err) res.send(err)
        });*/
        console.log(req.profile)
        job.paid = true;
        res.json(req.profile)
    } else {
        res.json({err: 'not enough balance in order to pay for this job'})
    }
});

/**
 * @readonly userId
 * @returns Deposit money in balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
 */
app.post('/balances/deposit/:userId', getProfile, async(req, res) => {
    const {Job} = req.app.get('models')
    const job = await Job.create({

    })
    job.save(function(err) {
        if (err) res.send.err
    })
});

/**
 * @requires start & end date for date range
 * @returns Returns the profession that earned the most money (sum of jobs paid) for any contactor that worked in the query time range.
 */
app.get('/admin/best-profession/:start?/:end?', getProfile, async(req, res) => {
    const {Job, Contract, Profile, Contractor} = req.app.get('models')
    const {start, end} = req.params
    const profession = await Profile.findAll({
        where: {type: 'contractor'},
        include: [{
            model: Contract,
            as: Contractor
        }, {
            model: Job,
            where: {paid: true}
        }]
    })
    res.json(profession)
});

/**
 * @requires start & end date for date range
 * @returns  returns the clients the paid the most for jobs in the query time period. limit query parameter should be applied, default limit is 2.
 */
app.get('/admin/best-clients/:start?/:end?', getProfile, async(req,res) => {

});

module.exports = app;
