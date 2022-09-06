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

const admin_email = 'ifiteka@gmail.com';
const admin_pass = 'anyuakiraly';

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
            name: name,
            email: email,
            password: password,
            xp: xp,
            point: 0,
            daily_point: dp,
            ifipoint: 0,
            trades: 0,
            parts: {
              shupp: 0,
              omlas: 0,
              porkolt: 0,
              kaloz: 0,
              malna:0
            },
            part: 'shupp'
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

    let prices = {};
    let stats = {};
    let hxp = 0;
    let team = "";
    
    await database.ref('hour_xp')
      .once('value')
      .then( (h) => {
        hxp = h.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('part_prices')
      .once('value')
      .then((pric) => { 
        prices = pric.val();
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

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then((user) => { team = user.val().team; })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    res.send({
      token: token,
      role: jwt.decode(token).role,
      stats: stats,
      prices: prices,
      hxp: hxp,
      team: team
    });
  });
});

app.post('/part_price', async (req, res) => {
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
    await database.ref('part_price')
      .once('value')
      .then((price) => {
        res.send({
          token: token,
          role: jwt.decode(token).role,
          price: price.val()
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
  });
});

app.post('/prices', async (req, res) => {
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

    let prices = [];

    await database.ref('part_prices')
      .once('value')
      .then((priceses) => {
        priceses.forEach((price) => {
          prices.push({
            'name': price.key,
            'price': price.val()
          })
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
      res.send({
        token: token,
        role: jwt.decode(token).role,
        prices: prices
      });
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

    let part = 0;
    let xp = 0;

    await database.ref('users/' + jwt.decode(token).id + '/parts/' + shop.part)
      .once('value')
      .then(async (p) => {
        part = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + jwt.decode(token).id)
      .child('parts')
      .update({
        [shop.part]: parseInt(part) + parseInt(shop.buy)
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
  const {part, nr,  team} = req.body;

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
    let other_team_part = "";
    let part_nr = 0;
    let now = new Date();

    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        id = parseInt(user.val().trades) + 1;
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/')
      .once('value')
      .then(async (users) => {
        users.forEach(user => {
          if(user.val().team == team)
            other_team_part = user.val().part;
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
    })

    await database.ref('trade/' + jwt.decode(token).id + '/' + id)
      .set({
          give: part,
          get: other_team_part,
          nr: nr,
          team: team
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('all_trades/' + jwt.decode(token).id + '/' + id)
      .set({
          give: part,
          get: other_team_part,
          nr: nr,
          team: team,
          push_time: now.toLocaleString('ro-RO'),
          refuze_time: "",
          accept_time: "",
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

    await database.ref('users/' + jwt.decode(token).id + '/parts/' + part)
      .once('value')
      .then(async (p) => {
        part_nr = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
    })

    await database.ref('users/' + jwt.decode(token).id)
      .child('parts')
      .update({
        [part]: parseInt(part_nr) - parseInt(nr)
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
    let part = "";
    let part_nr = 0;
    let nr = 0;
    let now = new Date();

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
          if(t.val().team === this_team && JSON.stringify(t.val().give) === JSON.stringify(trade.trade.give) && JSON.stringify(t.val().get) === JSON.stringify(trade.trade.get) && JSON.stringify(t.val().nr) === JSON.stringify(trade.trade.nr)) 
            nr = t.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('trade/' + pushed_team_id + "/" + nr)
      .update({
        'state': "elutasítva a(z) " + this_team + " csapattól",
        'refuze_time': now.toLocaleString('ro-RO')
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + pushed_team_id + "/" + nr)
      .remove()
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id + '/part')
      .once('value')
      .then( (p) => {
          part = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id + '/parts/' + part)
      .once('value')
      .then( (p) => {
          part_nr = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + pushed_team_id)
      .child('parts')
      .update({
        [part]: parseInt(part_nr) + parseInt(trade.trade.nr)
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    res.send({team: trade.team});
  });
});

app.post('/refuze_trade2', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { part, trade } = req.body;

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
    
    let part_nr = 0;
    let nr = 0;
    let now = new Date();
    
    await database.ref('trade/' + jwt.decode(token).id)
      .once('value')
      .then( (trades) => {
        trades.forEach( (t) => {
          if(t.val().team === trade.team && JSON.stringify(t.val().give) === JSON.stringify(trade.trade.give) && JSON.stringify(t.val().get) === JSON.stringify(trade.trade.get) && JSON.stringify(t.val().nr) === JSON.stringify(trade.trade.nr)) 
            nr = t.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
      
    
    await database.ref('all_trades/' + jwt.decode(token).id + "/" + nr)
      .update({
        'state': "visszavont",
        'refuze_time': now.toLocaleString('ro-RO')
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('trade/' + jwt.decode(token).id + "/" + nr)
      .remove()
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
      await database.ref('users/' + jwt.decode(token).id + '/parts/' + part)
        .once('value')
        .then( (p) => {
            part_nr = p.val();
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })

    await database.ref('users/' + jwt.decode(token).id)
      .child('parts')
      .update({
        [part]: parseInt(part_nr) + parseInt(trade.trade.nr)
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    res.send({team: trade.team});
  });
});

app.post('/accept_trade', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { part, trade } = req.body;

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
    let other_team_part = "";
    let other_team_part_nr = 0;
    let part_nr = 0;
    let part_nr2 = 0;
    let nr = 0;
    let now = new Date();

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
          if(t.val().team === this_team && JSON.stringify(t.val().give) === JSON.stringify(trade.trade.give) && JSON.stringify(t.val().get) === JSON.stringify(trade.trade.get) && JSON.stringify(t.val().nr) === JSON.stringify(trade.trade.nr)) 
            nr = t.key;
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('all_trades/' + pushed_team_id + "/" + nr)
      .update({
        'state': "elfogadva a(z) " + this_team + " csapattól",
        'accept_time': now.toLocaleString('ro-RO')
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('trade/' + pushed_team_id + "/" + nr)
      .remove()
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id + '/part')
      .once('value')
      .then( (p) => {
          other_team_part = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + jwt.decode(token).id + '/parts/' + other_team_part)
      .once('value')
      .then( (p) => {
        part_nr = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + jwt.decode(token).id + '/parts/' + part)
      .once('value')
      .then( (p) => {
        part_nr2 = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id + '/parts/' + part)
      .once('value')
      .then( (p) => {
          other_team_part_nr = p.val();
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + jwt.decode(token).id)
      .child('parts')
      .update({
        [part]: parseInt(part_nr2) - parseInt(trade.trade.nr),
        [other_team_part]: parseInt(part_nr) + parseInt(trade.trade.nr)
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + pushed_team_id)
      .child('parts')
      .update({
        [part]: parseInt(other_team_part_nr) + parseInt(trade.trade.nr)
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
      
    res.send({
      team: trade.team,
      nr: trade.trade.nr,
      part: other_team_part
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
              ifipoint: user.val().ifipoint,
              trades: user.val().trades,
              parts: user.val().parts
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
    let price = 0;
    let prices = {};
    let parts = {};
    let selected_parts = [];

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

    await database.ref('part_price')
      .once('value')
      .then( (pr) => {
        price = pr.val();
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('part_prices')
      .once('value')
      .then( (pric) => {
        prices = pric.val();
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      }) 

    await database.ref('parts')
      .once('value')
      .then( (p) => {
        parts = p.val();
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      }) 

    await database.ref('users/')
      .once('value')
      .then( (users) => {
        users.forEach((user)=>{
          selected_parts.push({
            'team': user.val().team,
            'part': user.val().part,
          })
        })
        
      })
      .catch((error) => { 
        res.send({code: 400, message: error.message});
      }) 
      
    res.send({
      dp: dp,
      xp: xp,
      hxp: hxp,
      parts: parts,
      price: price,
      prices: prices,
      selected_parts: selected_parts
    });
  })
});

app.post('/setup', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  const {
    starterXp,
    pricePart,
    dailyPoint,
    hourXp,
    houndred1,
    houndred2,
    houndred3,
    houndred4,
    parts
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
      .update({ 'part_price': pricePart })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('/')
      .update({ 'daily_points': dailyPoint })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('/')
      .update({ 'hour_xp': hourXp })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('part_prices')
      .update({ 
        'houndred1': houndred1,
        'houndred2': houndred2,
        'houndred3': houndred3,
        'houndred4': houndred4
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    
    parts.forEach((p) => {
      database.ref('users')
        .once('value')
        .then( (users) => {
          users.forEach( (user) => {
            if(user.val().team === p.team)
            {
              database.ref('users/' + user.key)
                .update({ 'part': p.part })
                .catch((error) => {
                  res.send({code: 400, message: error.message});
                })
            }
          })
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })
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
    let now = new Date();

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
        date: now.toLocaleString('ro-RO') 
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

app.post('/cash_ifipoint', (req, res) => {
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
    let ifipoint = 0;
    let price = 0;

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            ifipoint = user.val().ifipoint;
            dp = user.val().daily_point;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('part_prices/' + point_name)
      .once('value')
      .then( (o) => { price = o.val(); })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    if(ifipoint >= price)
      if(dp >= otp) {
        await database.ref('users/' + id)
          .update({ 
            'daily_point': parseInt(dp) - parseInt(otp),
          })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })

        await database.ref('users/' + id)
          .update({ 
            'ifipoint': parseInt(ifipoint) - parseInt(price)
          })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })
        res.send({status: "Added!"});
      }
      else
        res.send({code: 400, message: "Ma már nem lehet ennyi pontra váltani. Próbáld holnap!"});
    else
      res.send({code: 400, message: "Nincs elég ifi pont a pont beváltásra!"});
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

app.post('/add_ifipoint', (req, res) => {
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
    let point_now = 0;
    let now = new Date();
    let parts = {};

    await database.ref('users')
      .once('value')
      .then( (users) => {
        users.forEach( (user) => {
          if(user.val().team === team)
          {
            id = user.key;
            point_now = user.val().ifipoint;
          }
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('getted_ifipoits')
      .once('value')
      .then( (ad) => { db = ad.val().db +1; })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('getted_ifipoits/' + db)
      .set({ 
        team: team,
        date: now.toLocaleString('ro-RO') 
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('getted_ifipoits')
      .update({ 'db': db })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + id)
      .update({ 'ifipoint': parseInt(point_now) + parseInt(1) })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    
    await database.ref('users/' + id + '/parts')
      .once('value')
      .then( (part) => { parts = part.val(); })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    await database.ref('users/' + id + '/parts')
      .update({ 
        'shupp': parseInt(parts.shupp) - parseInt(1),
        'omlas': parseInt(parts.omlas) - parseInt(1),
        'porkolt': parseInt(parts.porkolt) - parseInt(1),
        'kaloz': parseInt(parts.kaloz) - parseInt(1),
        'malna': parseInt(parts.malna) - parseInt(1),
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })

    res.send({status: "Added!"});
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