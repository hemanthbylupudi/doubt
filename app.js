const express = require('express')
const {format} = require('date-fns')
const app = express()
app.use(express.json())
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Running Successfully')
    })
  } catch (error) {
    console.log(error.message)
  }
}
initializeDbAndServer()
// API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `SELECT * FROM user where username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `INSERT INTO user(username,password,name,gender)
        VALUES(
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        );`
      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  }
})
//API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `select * from user where username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = await jwt.sign(payload, 'qwertyuiop')
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
// AUTHENTICATION
const authenticateToken = async (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'qwertyuiop', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}
//API 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const res1Query = `SELECT * FROM user WHERE username='${username}';`
  const res1 = await db.get(res1Query)
  const getFollowingQuery = `SELECT u.username, t.tweet, t.date_time AS dateTime
FROM tweet AS t
JOIN user AS u ON t.user_id = u.user_id
WHERE t.user_id IN (
    SELECT following_user_id
    FROM follower
    WHERE follower_user_id = ${res1.user_id}
)
ORDER BY t.tweet_id DESC
LIMIT 4 OFFSET 0;`
  const getFollowingUsers = await db.all(getFollowingQuery)
  response.send(getFollowingUsers)
})
//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const res1Query = `SELECT DISTINCT name FROM user INNER JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = (SELECT user_id FROM user WHERE username='${username}');`
  const res1 = await db.all(res1Query)
  response.send(res1)
})
//API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const resQuery = `SELECT DISTINCT name FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id 
  WHERE follower.following_user_id = (SELECT user_id FROM user WHERE username='${username}');`
  const result = await db.all(resQuery)
  response.send(result)
})
//API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const user1Query = `SELECT user_id as user1 from user where username='${username}';`
  const user1 = await db.get(user1Query)
  //console.log(user1)
  const {tweetId} = request.params
  const user2Query = `SELECT user_id as user2 from tweet where tweet_id=${tweetId};`
  const user2 = await db.get(user2Query)
  //console.log(user1, user2)
  const isUser1FollowingQuery = `SELECT tweet.tweet, 
      (SELECT COUNT(like_id) FROM like WHERE tweet_id=${tweetId}) AS likes,
      (SELECT COUNT(reply_id) FROM reply WHERE tweet_id=${tweetId}) AS replies,
      tweet.date_time AS dateTime 
      FROM tweet 
      INNER JOIN follower ON tweet.user_id=follower.following_user_id
      WHERE follower.follower_user_id=${user1.user1} AND tweet.tweet_id=${tweetId};`
  const isUser1Following = await db.get(isUser1FollowingQuery)
  //console.log(isUser1Following)
  if (isUser1Following === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(isUser1Following)
  }
})
//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const user1Query = `SELECT user_id as user1 from user where username='${username}';`
    const user1 = await db.get(user1Query)
    const user2Query = `SELECT user_id as user2 from tweet where tweet_id=${tweetId};`
    const user2 = await db.get(user2Query)
    //console.log(user1, user2)
    const isUserFollowsQuery = `SELECT username from user join follower where follower_user_id=${user1.user1} AND following_user_id=${user2.user2};`
    const isUserFollows = await db.get(isUserFollowsQuery)
    if (isUserFollows === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      let resultList = []
      const resultQuery = `SELECT username FROM like INNER JOIN user ON like.user_id=user.user_id WHERE like.tweet_id=${tweetId};`
      const result = await db.all(resultQuery)
      for (let i of result) {
        resultList.push(i.username)
      }
      response.send({
        likes: resultList,
      })
    }
  },
)
//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const user1Query = `SELECT user_id as user1 from user where username='${username}';`
    const user1 = await db.get(user1Query)
    const user2Query = `SELECT user_id as user2 from tweet where tweet_id=${tweetId};`
    const user2 = await db.get(user2Query)
    //console.log(user1, user2)
    const isUserfollowsQuery = `select follower_id from follower where follower_user_id=${user1.user1} AND following_user_id=${user2.user2};`
    const isUserfollows = await db.get(isUserfollowsQuery)
    if (isUserfollows === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const exampleQuery = `SELECT count(reply_id) from reply where tweet_id=${tweetId};`
      const resultQuery = `SELECT  name,reply from reply inner join user on user.user_id=reply.user_id where reply.user_id in (select user_id from reply where tweet_id=${tweetId}) AND tweet_id=${tweetId};`
      const result = await db.all(resultQuery)
      response.send({
        replies: result,
      })
    }
  },
)
//API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const userIdQuery = `select user_id from user where username='${username}';`
  const userId = await db.get(userIdQuery)
  //console.log(userId)
  const tweetIdQuery = `SELECT tweet_id from tweet where user_id=${userId.user_id};`
  const tweetId = await db.all(tweetIdQuery)
  console.log(tweetId)
  const resultQuery = `Select distinct tweet,(select count(like_id) from like where 
  tweet_id=tweet.tweet_id) as likes,
  (select count(reply_id) from reply where tweet_id=tweet.tweet_id) as replies,
  date_time from tweet where user.user_id=${userId.user_id};`
  const result = await db.all(resultQuery)
  response.send(result)
})
//API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const presentTime = format(new Date(), 'yyyy-MM-dd hh:mm:ss')
  console.log(presentTime)
  const getUserQuery = `SELECT user_id from user where username='${username}';`
  const getUserId = await db.get(getUserQuery)
  const userId = getUserId.user_id
  const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
  VALUES(
    '${tweet}',
    ${userId},
    '${presentTime}'
  );`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})
//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getTweetedUserQuery = `SELECT user_id from tweet where tweet_id=${tweetId};`
    const getTweetedUser = await db.get(getTweetedUserQuery)
    const userIdQuery = `select user_id from user where username='${username}';`
    const userId = await db.get(userIdQuery)
    if (
      getTweetedUser === undefined ||
      getTweetedUser.user_id !== userId.user_id
    ) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = `DELETE FROM tweet where tweet_id=${tweetId};`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)
module.exports = app
