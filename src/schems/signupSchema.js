const Joi = require('joi');

const signupSchema = Joi.object({
    team: Joi.string().min(3).max(128).required(),
    name: Joi.string().min(3).max(128).required(),
    email: Joi.string().email().min(8).max(256).required(),
    password: Joi.string().min(3).max(128).required(),
    password2: Joi.string().valid(Joi.ref('password')).required(),
})

module.exports = signupSchema;