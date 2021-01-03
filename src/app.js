const express = require('express');
const bodyParser = require('body-parser');
const { Op, json } = require("sequelize");
const {sequelize, Contract, Profile} = require('./model');
const {getProfile} = require('./middleware/getProfile');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

/**
 * @returns Contract only if it belongs to the profile calling
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    const {Contract} = req.app.get('models');
    const {id} = req.params;
    const contract = await Contract.findOne({
        where: {id, 
            [Op.or]: [{ClientId: req.profile.get('id')}, {ContractorId: req.profile.get('id')}]
        }
    });
    if (!contract) return res.status(404).end();
    res.json(contract);
});

/**
 * @returns List of contracts belonging to a user (client or contractor), the list should only contain non terminated contracts.
 */
app.get('/contracts', getProfile, async(req, res) => {
    const {Contract} = req.app.get('models');
    const contracts = await Contract.findAll({
        where: {
            [Op.or]: [{ClientId: req.profile.get('id')}, {ContractorId: req.profile.get('id')}],
            [Op.and]: [
                {status: {
                    [Op.like]: 'new',
                    [Op.like]: 'in_progress'
                }
            }]
        }
    });
    if (!contracts) return res.status(404).end();
    res.json(contracts);
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
            where: {
                status: 'in_progress', 
                [Op.or]: [{ClientId: req.profile.get('id')}, {ContractorId: req.profile.get('id')}]
            }
        }]
    });
    if (!jobs) return res.status(404).end()
    res.json(jobs)
});

/**
 * was supposed to implement it as post request, but after checking required functionlity(update records), decided to implment it as put request 
 * @requires job_id to pay
 * @returns Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
 */
app.put('/jobs/:job_id/pay', getProfile, async(req, res) => {
    const {Job, Contract, Profile} = req.app.get('models');
    const {job_id} = req.params;
    const job = await Job.findOne({
        where: {id: job_id, paid: null},
        include: [{
            model: Contract,
            where: {
                [Op.or]: [{ClientId: req.profile.get('id')}, {ContractorId: req.profile.get('id')}]
            }
        }]
    });
    if (!job) return res.status(404).end();
    const currentBalance = req.profile.get('balance');
    if (job.price <= currentBalance) {
        const contractor = Profile.findOne({
            where: {id: job.contract.ContractorId}
        });
        if (!contractor) return res.send.err = "No contractor found";
        await contractor.update({
            balance: Contractor.balance + job.price
        });
        await req.profile.update({
            balance: currentBalance - job.price
        });
        job.update({
            paid: true
        });
    } else {
        res.json({err: 'Not enough balance in order to pay for job id : ' + job_id});
    }
    return res.status(200).end();
});

/**
 * was supposed to implement it as post request, but after checking required functionlity(update records), decided to implment it as put request
 * Also missing deposit amount, assuming that it given as param
 * @readonly userId
 * @returns Deposit money in balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
 */
app.put('/balances/deposit/:userId/:amount', getProfile, async(req, res) => {
    const {Job, Contract} = req.app.get('models');
    const {userId, amount} = req.params;
    const sumOfUnpaidJobs = await Job.sum('price', {
        where: {paid: null},
        include: [{
            model: Contract,
            where: {
                [Op.or]: [{ClientId: req.profile.get('id')}]
            }
        }]
    });
    if (sumOfUnpaidJobs * 0.25 >= amount) {
        const profile = await Profile.findOne({
            where: {id: userId, type: 'contractor'}
        });
        await profile.update({
            balance: profile.balance + parseInt(amount)
        });
    } else {
        res.json({err: 'Cannot deposit for user id : ' + userId});
    }
    return res.status(200).end();
});

/** 
 * @requires start & end date for date range
 * @returns Returns the profession that earned the most money (sum of jobs paid) for any contactor that worked in the query time range.
 */
app.get('/admin/best-profession/:start/:end', getProfile, async(req, res) => {
    const {Job, Contract, Profile} = req.app.get('models');
    const {start, end} = req.params;
    const profession = await Job.findAll({
        attributes: [
            'ContractId',
            [sequelize.fn('sum', sequelize.col('price')), 'total_earnings'],
          ],
        where: {paid: true, paymentDate: {[Op.between]: [start, end]}},
        include: [{
            model: Contract,
            where: {
                [Op.or]: [{ContractorId: req.profile.get('id')}]
            },
            group: 'ContractId'
        }]
    });

    res.json(profession)
});

/**
 * @requires start & end date for date range
 * @returns  returns the clients the paid the most for jobs in the query time period. limit query parameter should be applied, default limit is 2.
 */
app.get('/admin/best-clients/:start/:end/:limit?', getProfile, async(req,res) => {
    const {Job, Contract} = req.app.get('models');
    const {start, end, limit} = req.params;
    const clients = await Job.findAll({
        attributes: [
            'ContractId',
            [sequelize.fn('sum', sequelize.col('price')), 'total_earnings'],
          ],
        where: {paid: true, paymentDate: {[Op.between]: [start, end]}},
        include: [{
            model: Contract,
            where: {
                [Op.or]: [{ClientId: req.profile.get('id')}]
            },
            group: 'ContractId'
        }],
        limit: limit || 2
    });
    res.json(clients);
});

module.exports = app;
