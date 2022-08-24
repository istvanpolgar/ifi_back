//EXPRESS
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//CORS POLICY
const cors = require('cors');
app.use(cors());

//FIREBASE DATABASE
const firebase = require('firebase');
const firebaseConfig = require('./src/configs/firebaseConfig');
firebase.initializeApp(firebaseConfig);
const admin = firebase.auth();
const database = firebase.database();

//SCHEM'S
const signinSchema = require('./src/schems/signinSchema');
const signupSchema = require('./src/schems/signupSchema');

//PORT
const port = process.env.PORT || 8080;

//ADMIN

const admin_email = 'istvanpolgar@yahoo.com';
const admin_pass = 'Isacson93';

//TOKEN
const refreshTokenSecret = 'thisisatokensecret';
let refreshTokens = [];
const jwt = require('jsonwebtoken');

//CRON-JOB
let CronJob = require('cron').CronJob;

var job = new CronJob('0 0 * * *', async function () {
  let dp = 0;
  await database.ref('daily_points')
    .once('value')
    .then( (point) => {
      dp = point.val();
    })
    .catch((error) => {
      console.log(error.message);
    })

  await database.ref('users')
    .once('value')
    .then( (users) => {
      users.forEach( (user) => {
        database.ref('users/' + user.key)
          .update({ daily_point: dp  })
          .catch((error) => {
            console.log(error.message);
          })
      })
    })
    .catch((error) => {
      console.log(error.message);
    })
}, null, true, 'Europe/Bucharest');

job.start();

app.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  await signinSchema.validateAsync(req.body)
    .then( () => {
        admin.signInWithEmailAndPassword(email, password)
            .then( () => { 
                if(!admin.currentUser.emailVerified){
                    admin.signOut();
                    res.send({code: 400, message: "A regisztráció nem került megerősítésre! Kérlek nézd meg a megadott e-mail fiókod!"});
                }
                else
                {
                  let accessToken = '';
                  if(email == admin_email && password == admin_pass) {
                    accessToken = jwt.sign({ 
                        id: admin.currentUser.uid,  
                        email: email,
                        role: 'organizer'
                      }, 
                      refreshTokenSecret,
                      { expiresIn: '24h' }
                    );
                  } else {
                    accessToken = jwt.sign({ 
                        id: admin.currentUser.uid,  
                        email: email,
                        role: 'team'
                      }, 
                      refreshTokenSecret,
                      { expiresIn: '1h' }
                    );
                  }
                  refreshTokens.push(accessToken);

                  res.send({
                    token: accessToken,
                    role: jwt.decode(accessToken).role
                  });
                }
            })
            .catch((error) => {
              res.send({code: 400, message: error.message});
            })
    })
    .catch((error) => {
        res.send({code: 400, message: error.message});
    })
});

app.post('/signup', async (req, res) => {
  const { team, name, email, password } = req.body;

  let xp = 0;
  let dp = 0;

  await database.ref('starter_xp')
    .once('value')
    .then( (st_xp) => {
      xp = st_xp.val();
    })
    .catch((error) => {
      res.send({code: 400, message: error.message});
    })

  await database.ref('daily_points')
    .once('value')
    .then( (point) => {
      dp = point.val();
    })
    .catch((error) => {
      res.send({code: 400, message: error.message});
    })

  await signupSchema.validateAsync(req.body)
  .then( () => { 
    admin.createUserWithEmailAndPassword(email, password)
    .then( () => {
      admin.currentUser.sendEmailVerification()
      .then(() => {
        database.ref('users/' + admin.currentUser.uid)
        .set({
            team: team,
            email: email,
            password: password,
            xp: xp,
            point: 0,
            trades: 0,
            daily_point: dp,
            ores: {
              iron: 0,
              bronze: 0,
              silver: 0,
              gold: 0,
              diamond: 0,
              ifirald: 0
            }
        })
        .then( () => {
          database.ref('xp_missions/' + admin.currentUser.uid)
          .set({
              db: 0
          })
          .then( () => {
            res.send({status: 'Validated'})
          })
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    })
    .catch((error) => {
      res.send({code: 400, message: error.message});
    })
  })
  .catch((error) => {
    res.send({code: 400, message: error.message});
  })
});

app.post('/forgotten_pass', async (req, res) => {
  try{
    const { email } = req.body;

    await admin.sendPasswordResetEmail(email)
    .then( () => {
      res.send({status: 'Sent'})
    })
    .catch((error) => {
      res.send({code: 400, message: error.message});
    })
  } catch (e) {
    res.send({code: 400, message: "Both fields are required!"});
  }
})

app.post('/team_info', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let points = [];
    let stats = {};
    let hxp = 0;
    
    await database.ref('hour_xp')
      .once('value')
      .then( (h) => {
        hxp = h.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('ores_to_points')
      .once('value')
      .then((otp) => { 
        otp.forEach( (o) => {
          points.push(o.val());
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then((user) => { stats = user.val(); })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({
      token: token,
      role: jwt.decode(token).role,
      stats: stats,
      points: points,
      hxp: hxp
    });
  });
});

app.post('/ore_prices', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    await database.ref('prices')
      .once('value')
      .then((prices) => {
        res.send({
          token: token,
          role: jwt.decode(token).role,
          prices: prices.val()
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
  });
});

app.post('/shop', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const shop = req.body;

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let ores = {};
    let xp = 0;

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        ores = user.val().ores;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + jwt.decode(token).id)
      .child('ores')
      .update({
        'bronze': parseInt(ores.bronze) + parseInt(shop.bronze),
        'diamond': parseInt(ores.diamond) + parseInt(shop.diamond),
        'gold': parseInt(ores.gold) + parseInt(shop.gold),
        'ifirald': parseInt(ores.ifirald) + parseInt(shop.ifirald),
        'iron': parseInt(ores.iron) + parseInt(shop.iron),
        'silver': parseInt(ores.silver) + parseInt(shop.silver),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
    })

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        xp = user.val().xp;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })  

    await database.ref('users/' + jwt.decode(token).id)
      .update({ 'xp': xp - shop.price})
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Finished"});    
  });
});

app.post('/get_teams', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let selectable_teams = [];

    await database.ref('users')
      .once('value')
      .then((teams) => {
        teams.forEach(t => {
          if(t.val().email !== admin_email && t.val().email !== jwt.decode(token).email)
            selectable_teams.push(t.val().team)
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })  
      
    res.send({
      token: token,
      role: jwt.decode(token).role,
      teams: selectable_teams
    });
  });
});

app.post('/all_teams', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let selectable_teams = [];

    await database.ref('users')
      .once('value')
      .then((teams) => {
        teams.forEach(t => {
          if(t.val().email !== admin_email)
            selectable_teams.push(t.val().team)
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })  
      
    res.send({
      token: token,
      role: jwt.decode(token).role,
      teams: selectable_teams
    });
  });
});

app.post('/trade', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const {pushed_ores, waited_ores, team} = req.body;

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let ores = {};

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        id = parseInt(user.val().trades) + 1;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + jwt.decode(token).id + '/' + id)
      .set({
          pushed_ores: pushed_ores,
          waited_ores: waited_ores,
          team: team
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('all_trades/' + jwt.decode(token).id + '/' + id)
      .set({
          pushed_ores: pushed_ores,
          waited_ores: waited_ores,
          team: team,
          state: "kiközölt"
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + jwt.decode(token).id)
      .update({
        'trades': id,
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
    })

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        ores = user.val().ores;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
    })

    await database.ref('users/' + jwt.decode(token).id)
      .child('ores')
      .update({
        'bronze': parseInt(ores.bronze) - parseInt(pushed_ores.bronze),
        'diamond': parseInt(ores.diamond) - parseInt(pushed_ores.diamond),
        'gold': parseInt(ores.gold) - parseInt(pushed_ores.gold),
        'ifirald': parseInt(ores.ifirald) - parseInt(pushed_ores.ifirald),
        'iron': parseInt(ores.iron) - parseInt(pushed_ores.iron),
        'silver': parseInt(ores.silver) - parseInt(pushed_ores.silver),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Finished"});    
  });
});

app.post('/trades', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    
    let this_team = "";
    let selectable_trades = [];
    let team_keys = [];

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then( async (user) => {
        this_team = user.val().team;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/')
      .once('value')
      .then( async (users) => {
        users.forEach( (user) => {
          team_keys[user.key] = user.val().team;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/')
      .once('value')
      .then( (trades) => {
        trades.forEach( (team) => {
          team.forEach((t) => {
            if(t.val().team === this_team)
              selectable_trades.push({
                'trade': t.val(),
                'team': team_keys[team.key]
              });
          })
        }) 
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })  

    res.send({
      token: token,
      role: jwt.decode(token).role,
      trades: selectable_trades
    });  
  });
});

app.post('/trades2', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    
    let selectable_trades = [];

    await database.ref('trade/' + jwt.decode(token).id)
      .once('value')
      .then( (trades) => {
        trades.forEach((t) => {
          selectable_trades.push({
            'trade': t.val(),
            'team': t.val().team
          });
        }) 
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })  

    res.send({
      token: token,
      role: jwt.decode(token).role,
      trades: selectable_trades
    });  
  });
});

app.post('/refuze_trade', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { trade } = req.body;

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let this_team = "";
    let pushed_team_id = "";
    let ores = {};
    let nr = 0;

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then( (user) => {
        this_team = user.val().team;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === trade.team){
            pushed_team_id = user.key;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('trade/' + pushed_team_id)
      .once('value')
      .then( (trades) => {
        trades.forEach( (t) => {
          if(t.val().team === this_team && JSON.stringify(t.val().pushed_ores) === JSON.stringify(trade.trade.pushed_ores) && JSON.stringify(t.val().waited_ores) === JSON.stringify(trade.trade.waited_ores)) 
            nr = t.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('trade/' + pushed_team_id + "/" + nr)
      .update({
        'state': "elutasítva a(z) " + this_team + " csapattól"
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + pushed_team_id + "/" + nr)
      .remove()
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id)
      .once('value')
      .then( (user) => {
        ores = user.val().ores;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + pushed_team_id)
      .child('ores')
      .update({
        'bronze': parseInt(ores.bronze) + parseInt(trade.trade.pushed_ores.bronze),
        'diamond': parseInt(ores.diamond) + parseInt(trade.trade.pushed_ores.diamond),
        'gold': parseInt(ores.gold) + parseInt(trade.trade.pushed_ores.gold),
        'ifirald': parseInt(ores.ifirald) + parseInt(trade.trade.pushed_ores.ifirald),
        'iron': parseInt(ores.iron) + parseInt(trade.trade.pushed_ores.iron),
        'silver': parseInt(ores.silver) + parseInt(trade.trade.pushed_ores.silver),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    res.send({team: trade.team});
  });
});

app.post('/refuze_trade2', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { trade } = req.body;

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    
    let ores = {};
    let nr = 0;
    
    await database.ref('trade/' + jwt.decode(token).id)
      .once('value')
      .then( (trades) => {
        trades.forEach( (t) => {
          if(t.val().team === trade.team && JSON.stringify(t.val().pushed_ores) === JSON.stringify(trade.trade.pushed_ores) && JSON.stringify(t.val().waited_ores) === JSON.stringify(trade.trade.waited_ores)) 
            nr = t.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('trade/' + jwt.decode(token).id + "/" + nr)
      .update({
        'state': "visszavont"
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + jwt.decode(token).id + "/" + nr)
      .remove()
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then( (user) => {
        ores = user.val().ores;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + jwt.decode(token).id)
      .child('ores')
      .update({
        'bronze': parseInt(ores.bronze) + parseInt(trade.trade.pushed_ores.bronze),
        'diamond': parseInt(ores.diamond) + parseInt(trade.trade.pushed_ores.diamond),
        'gold': parseInt(ores.gold) + parseInt(trade.trade.pushed_ores.gold),
        'ifirald': parseInt(ores.ifirald) + parseInt(trade.trade.pushed_ores.ifirald),
        'iron': parseInt(ores.iron) + parseInt(trade.trade.pushed_ores.iron),
        'silver': parseInt(ores.silver) + parseInt(trade.trade.pushed_ores.silver),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    res.send({team: trade.team});
  });
});

app.post('/accept_trade', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { trade } = req.body;

  if (!token) {
      return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let this_team = "";
    let pushed_team_id = "";
    let our_ores = {};
    let your_ores = {};
    let nr = 0;

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then( (user) => {
        this_team = user.val().team;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === trade.team){
            pushed_team_id = user.key;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('trade/' + pushed_team_id)
      .once('value')
      .then( (trades) => {
        trades.forEach( (t) => {
          if(t.val().team === this_team && JSON.stringify(t.val().pushed_ores) === JSON.stringify(trade.trade.pushed_ores) && JSON.stringify(t.val().waited_ores) === JSON.stringify(trade.trade.waited_ores)) 
            nr = t.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('all_trades/' + pushed_team_id + "/" + nr)
      .update({
        'state': "elfogadva a(z) " + this_team + " csapattól"
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + pushed_team_id + "/" + nr)
      .remove()
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then( (user) => {
        our_ores = user.val().ores;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id)
      .once('value')
      .then( (user) => {
        your_ores = user.val().ores;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + jwt.decode(token).id)
      .child('ores')
      .update({
        'bronze': parseInt(our_ores.bronze) - parseInt(trade.trade.waited_ores.bronze) + parseInt(trade.trade.pushed_ores.bronze),
        'diamond': parseInt(our_ores.diamond) - parseInt(trade.trade.waited_ores.diamond) + parseInt(trade.trade.pushed_ores.diamond),
        'gold': parseInt(our_ores.gold) - parseInt(trade.trade.waited_ores.gold) + parseInt(trade.trade.pushed_ores.gold),
        'ifirald': parseInt(our_ores.ifirald) - parseInt(trade.trade.waited_ores.ifirald) + parseInt(trade.trade.pushed_ores.ifirald),
        'iron': parseInt(our_ores.iron) - parseInt(trade.trade.waited_ores.iron) + parseInt(trade.trade.pushed_ores.iron),
        'silver': parseInt(our_ores.silver) - parseInt(trade.trade.waited_ores.silver) + parseInt(trade.trade.pushed_ores.silver),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id)
      .child('ores')
      .update({
        'bronze': parseInt(your_ores.bronze) + parseInt(trade.trade.waited_ores.bronze),
        'diamond': parseInt(your_ores.diamond) + parseInt(trade.trade.waited_ores.diamond),
        'gold': parseInt(your_ores.gold) + parseInt(trade.trade.waited_ores.gold),
        'ifirald': parseInt(your_ores.ifirald) + parseInt(trade.trade.waited_ores.ifirald),
        'iron': parseInt(your_ores.iron) + parseInt(trade.trade.waited_ores.iron),
        'silver': parseInt(your_ores.silver) + parseInt(trade.trade.waited_ores.silver),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
      
    res.send({
      team: trade.team,
      waited_ores: trade.trade.waited_ores
    });
  });
});

app.post('/role', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  
  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    res.send({role: jwt.decode(token).role});
  })
});

app.post('/team_stats', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  
  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    let stats = [];
    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( user => {
          if(user.val().email !== admin_email)
            stats.push({
              team: user.val().team,
              xp: user.val().xp,
              point: user.val().point,
              daily_point: user.val().daily_point,
              trades: user.val().trades,
              ores: user.val().ores
            })
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    res.send({stats: stats});
  })
});

app.post('/team_trades', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { team } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    let id = 0;
    let all_trades = [];

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( user => {
          if(user.val().team === team)
            id = user.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + id)
      .once('value')
      .then( (trades) => {
        trades.forEach( trade => {
          all_trades.push(trade.val());
        })
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      })
    res.send({trades: all_trades});
  })
});

app.post('/get_settings', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    let xp = 0;
    let dp = 0;
    let hxp = 0;
    let prices = {};
    let points = {};

    await database.ref('starter_xp')
      .once('value')
      .then( (st_xp) => {
        xp = st_xp.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('daily_points')
      .once('value')
      .then( (point) => {
        dp = point.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('hour_xp')
      .once('value')
      .then( (h) => {
        hxp = h.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('prices')
      .once('value')
      .then( (pr) => {
        prices = pr.val();
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('ores_to_points')
      .once('value')
      .then( (otp) => {
        points = otp.val();
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      }) 
    res.send({
      dp: dp,
      xp: xp,
      hxp: hxp,
      prices: prices,
      points: points
    });
  })
});

app.post('/setup', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const {
    dailyPoint,
    starterXp,
    priceIron,
    priceBronze,
    priceSilver,
    priceGold,
    priceDiamond,
    priceIfirald,
    houndred1,
    houndred2,
    houndred3,
    houndred4,
  } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }
    
    await database.ref('/')
      .update({ 'starter_xp': starterXp })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('/')
      .update({ 'daily_points': dailyPoint })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('prices')
      .update({ 
        'bronze': priceBronze,
        'diamond': priceDiamond,
        'gold': priceGold,
        'ifirald': priceIfirald,
        'iron': priceIron,
        'silver': priceSilver,
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('ores_to_points')
    .child('houndred1')
      .update({ 
        'bronze': houndred1.bronze,
        'diamond': houndred1.diamond,
        'gold': houndred1.gold,
        'ifirald': houndred1.ifirald,
        'iron': houndred1.iron,
        'silver': houndred1.silver,
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('ores_to_points')
      .child('houndred2')
        .update({ 
          'bronze': houndred2.bronze,
          'diamond': houndred2.diamond,
          'gold': houndred2.gold,
          'ifirald': houndred2.ifirald,
          'iron': houndred2.iron,
          'silver': houndred2.silver,
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })
    await database.ref('ores_to_points')
      .child('houndred3')
        .update({ 
          'bronze': houndred3.bronze,
          'diamond': houndred3.diamond,
          'gold': houndred3.gold,
          'ifirald': houndred3.ifirald,
          'iron': houndred3.iron,
          'silver': houndred3.silver,
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

    await database.ref('ores_to_points')
      .child('houndred4')
        .update({ 
          'bronze': houndred4.bronze,
          'diamond': houndred4.diamond,
          'gold': houndred4.gold,
          'ifirald': houndred4.ifirald,
          'iron': houndred4.iron,
          'silver': houndred4.silver,
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })
    res.send({status: "Updated!"});
  })
});

app.post('/addxp', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team, xp } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let db = 0;
    let xp_now = 0;
    let date = new Date().toLocaleString();

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            xp_now = user.val().xp;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('added')
      .once('value')
      .then( (ad) => { db = ad.val().db +1; })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('added/' + db)
      .set({ 
        team: team,
        xp: xp,
        date: date 
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('added')
      .update({ 'db': db })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + id)
      .update({ 'xp': parseInt(xp_now) + parseInt(xp) })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Added!"});
  })
});

app.post('/xp_won', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let xp_now = 0;
    let xp = 0;
    let db = 0;
    let last_time = 0;
    let now = new Date();

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            xp_now = user.val().xp;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('xp_missions/' + id + '/db')
      .once('value')
      .then( (d) => {
        db = d.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    

    if(db === 0)
    {
      db = db + 1;

      await database.ref('xp_missions/' + id + '/' + db)
        .set({ time: now.getTime() })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      await database.ref('xp_missions/' + id)
        .update({ 'db': db })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      await database.ref('hour_xp')
        .once('value')
        .then( (h) => {
          xp = h.val();
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      await database.ref('users/' + id)
        .update({ 'xp': parseInt(xp_now) + parseInt(xp) })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      res.send({status: "Added!"});
      }
    else
    {
      await database.ref('xp_missions/' + id + '/' + db)
        .once('value')
        .then( (time) => {
          last_time = time.val().time;
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      if(Math.abs(now.getTime() - last_time)/1000 >= 3600)
      {
        db = db + 1;
        await database.ref('xp_missions/' + id + '/' + db)
          .set({ time: now.getTime() })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })

        await database.ref('xp_missions/' + id)
          .update({ 'db': db })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })

        await database.ref('hour_xp')
          .once('value')
          .then( (h) => {
            xp = h.val();
          })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })
  
        await database.ref('users/' + id)
          .update({ 'xp': parseInt(xp_now) + parseInt(xp) })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })
    
        res.send({status: "Added!"});
      }
      else
        res.send({code: 400, message: "A csapat még kell várjon " + (60-Math.round(Math.abs(now.getTime() - last_time)/1000/60)) + " percet"});
    }
  })
});

app.post('/xp_lost', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let db = 0;
    let last_time = 0;
    let now = new Date();

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('xp_missions/' + id + '/db')
      .once('value')
      .then( (d) => {
        db = d.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    

    if(db === 0)
    {
      db = db + 1;

      await database.ref('xp_missions/' + id + '/' + db)
        .set({ time: now.getTime() })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      await database.ref('xp_missions/' + id)
        .update({ 'db': db })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      res.send({status: "Added!"});
      }
    else
    {
      await database.ref('xp_missions/' + id + '/' + db)
        .once('value')
        .then( (time) => {
          last_time = time.val().time;
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

      if(Math.abs(now.getTime() - last_time)/1000 >= 3600)
      {
        db = db + 1;
        await database.ref('xp_missions/' + id + '/' + db)
          .set({ time: now.getTime() })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })

        await database.ref('xp_missions/' + id)
          .update({ 'db': db })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })
    
        res.send({status: "Added!"});
      }
      else
        res.send({code: 400, message: "A csapat még kell várjon " + (60-Math.round(Math.abs(now.getTime() - last_time)/1000/60)) + " percet"});
    }
  })
});

app.post('/hour_xp', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    await database.ref('hour_xp')
      .once('value')
      .then( (hxp) => {
        res.send({xp: hxp.val()});
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
  })
});

app.post('/takexp', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team, xp } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let xp_now = 0;

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            xp_now = user.val().xp;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + id)
      .update({ 'xp': parseInt(xp_now) - parseInt(xp) })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Added!"});
  })
});

app.post('/addpoint', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team, point } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let db = 0;
    let point_now = 0;
    let date = new Date().toLocaleString();

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            point_now = user.val().point;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('added')
      .once('value')
      .then( (ad) => { db = ad.val().db +1; })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('added/' + db)
      .set({ 
        team: team,
        point: point,
        date: date 
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('added')
      .update({ 'db': db })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + id)
      .update({ 'point': parseInt(point_now) + parseInt(point) })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Added!"});
  })
});

app.post('/takepoint', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team, point } = req.body;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let point_now = 0;

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            point_now = user.val().point;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + id)
      .update({ 'point': parseInt(point_now) - parseInt(point) })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Added!"});
  })
});

app.post('/ores_to_points', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const { team, otp } = req.body;
  let num = otp/100;
  let point_name = 'houndred' + num;

  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let dp = 0;
    let ores = {};
    let prices = {};

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            dp = user.val().daily_point;
            ores = user.val().ores;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('ores_to_points/' + point_name)
      .once('value')
      .then( (o) => { prices = o.val(); })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    if(ores.bronze >= prices.bronze && ores.diamond >= prices.diamond && ores.gold >= prices.gold && ores.ifirald >= prices.ifirald && ores.iron >= prices.iron && ores.silver >= prices.silver)
      if(dp - otp >= 0) {
        await database.ref('users/' + id)
          .update({ 
            'daily_point': parseInt(dp) - parseInt(otp),
          })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })

        await database.ref('users/' + id)
          .child('ores')
          .update({ 
            'bronze': parseInt(ores.bronze) - parseInt(prices.bronze),
            'diamond': parseInt(ores.diamond) - parseInt(prices.diamond),
            'gold': parseInt(ores.gold) - parseInt(prices.gold),
            'ifirald': parseInt(ores.ifirald) - parseInt(prices.ifirald),
            'iron': parseInt(ores.iron) - parseInt(prices.iron),
            'silver': parseInt(ores.silver) - parseInt(prices.silver),
          })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })
        res.send({status: "Added!"});
      }
      else
        res.send({code: 400, message: "Ma már nem lehet ennyi pontra váltani. Próbáld holnap!"});
    else
      res.send({code: 400, message: "Nincs elég érc a pont beváltásra!"});
  })
});

app.post('/get_missions', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { team } = req.body;
  
  if (!token) {
    return res.send({code: 400, message: "Hiányzó token!"});;
  }

  if (!refreshTokens.includes(token)) {
      return res.send({code: 400, message: "Helytelen token!"});
  }

  jwt.verify(token, refreshTokenSecret, async (err) => {
    if (err) {
        return res.send({code: 400, message: "Nem létező token!"});
    }

    let id = 0;
    let missions = [];

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('xp_missions/' + id)
      .once('value')
      .then( (user) => {
        user.forEach( (time) => {
          if(time.key !== "db")
            missions.push(time.val().time);
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    res.send({missions: missions});
  })
});

app.post('/logout', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  refreshTokens = refreshTokens.filter(t => t !== token);
  res.send({status: "Logged out!"});
});

app.listen(port, () => {
    console.log(`Education app listening at http://localhost:${port}`);
})