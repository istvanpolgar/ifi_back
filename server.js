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

//TOKEN
const refreshTokenSecret = 'thisisatokensecret';
let refreshTokens = [];
const jwt = require('jsonwebtoken');

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
                  if(email == "ifiteka@gmail.com" && password == "legjobbcsapat") {
                    accessToken = jwt.sign({ 
                        id: admin.currentUser.uid,  
                        role: 'organizer'
                      }, 
                      refreshTokenSecret,
                      { expiresIn: '24h' }
                    );
                  } else {
                    accessToken = jwt.sign({ 
                        id: admin.currentUser.uid,  
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
  const { team, email, password } = req.body;
  await signupSchema.validateAsync(req.body)
  .then( () => { 
    admin.createUserWithEmailAndPassword(email, password)
    .then( () => {
      admin.currentUser.sendEmailVerification()
      .then( () => {
        database.ref('users/' + admin.currentUser.uid)
        .set({
            team: team,
            email: email,
            password: password,
            xp: 0,
            point: 0,
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
          res.send({status: 'Validated'})
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
    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then((user) => {
        res.send({
          "token": token,
          "role": jwt.decode(token).role,
          "stats": user.val()
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
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
        res.json({
          "token": token,
          "role": jwt.decode(token).role,
          "prices": prices.val()
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
    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        let ores = user.val().ores;
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
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
    })
    await database.ref('users/' + jwt.decode(token).id)
      .once('value')
      .then(async (user) => {
        let xp = user.val().xp;
        await database.ref('users/' + jwt.decode(token).id)
          .update({ 'xp': xp - shop.price})
          .catch((error) => {
            res.send({code: 400, message: error.message});
        })
      })
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
          selectable_teams.push(t.val().team)
        });
        res.json({
          "token": token,
          "role": jwt.decode(token).role,
          "teams": selectable_teams
        });
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })   
  });
});

app.post('/logout', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  
  refreshTokens = refreshTokens.filter(t => t !== token);

  res.send({status: "Logged out!"});
});

app.listen(port, () => {
    console.log(`Education app listening at http://localhost:${port}`);
})