/*
 *       .                             .o8                     oooo
 *    .o8                             "888                     `888
 *  .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
 *    888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
 *    888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
 *    888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
 *    "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 *  ========================================================================
 *  Author:     Chris Brame
 *  Updated:    1/20/19 4:43 PM
 *  Copyright (c) 2014-2019. All rights reserved.
 */
var _ = require('lodash')
var async = require('async')
var winston = require('../logger')
var utils = require('../helpers/utils')
var userSchema = require('../models/user')

var sharedVars = require('./index').shared
var sharedUtils = require('./index').utils
const socketEventConst = require('./socketEventConsts')

var events = {}

function register (socket) {
  events.onSetUserOnlineStatus(socket)
  events.onUpdateUsers(socket)
  events.updateOnlineBubbles(socket)
  events.updateConversationsNotifications(socket)
  events.spawnChatWindow(socket)
  events.getOpenChatWindows(socket)
  events.onChatMessage(socket)
  events.onChatTyping(socket)
  events.onChatStopTyping(socket)
  events.saveChatWindow(socket)
  events.onDisconnect(socket)

  if (socket.request.user.logged_in) {
    joinChatServer(socket)
  }
}

function eventLoop () {
  updateUsers()
  updateOnlineBubbles()
  updateConversationsNotifications()
}

events.onUpdateUsers = function (socket) {
  socket.on('updateUsers', updateUsers)
}
events.onSetUserOnlineStatus = function (socket) {
  socket.on(socketEventConst.UI_ONLINE_STATUS_SET, data => {
    const state = data.state
    const user = socket.request.user
    let exists = false

    if (state === 'idle') {
      if (sharedVars.idleUsers.hasOwnProperty(user.username.toLowerCase())) exists = true

      if (!exists) {
        if (user.username.length !== 0) {
          sharedVars.idleUsers[user.username.toLowerCase()] = {
            sockets: [socket.id],
            user
          }

          updateOnlineBubbles()
        }
      } else {
        const idleUser = sharedVars.idleUsers[user.username.toLowerCase()]
        if (!_.isUndefined(idleUser)) {
          idleUser.sockets.push(socket.id)

          updateOnlineBubbles()
        }
      }
    } else if (state === 'active') {
      if (sharedVars.idleUsers.hasOwnProperty(user.username.toLowerCase())) {
        delete sharedVars.idleUsers[user.username.toLowerCase()]

        updateOnlineBubbles()
      }
    }
  })
}

function updateUsers () {
  var sortedUserList = sharedUtils.sortByKeys(sharedVars.usersOnline)
  _.forEach(sortedUserList, function (v) {
    var user = v.user
    var sockets = v.sockets
    if (user && sockets.length > 0) {
      _.forEach(sockets, function (sock) {
        var socket = _.find(sharedVars.sockets, function (s) {
          return s.id === sock
        })

        if (socket) {
          if (user.role.isAdmin || user.role.isAgent) {
            socket.emit('updateUsers', sortedUserList)
          } else {
            var groupSchema = require('../models/group')
            groupSchema.getAllGroupsOfUser(user._id, function (err, groups) {
              if (!err) {
                var usersOfGroups = _.map(groups, function (g) {
                  return _.map(g.members, function (m) {
                    return { user: m }
                  })
                })

                var agentsAndAdmins = _.chain(sortedUserList)
                  .filter(function (u) {
                    return u.user.role.isAdmin || u.user.role.isAgent
                  })
                  .map(function (u) {
                    return u
                  })
                  .value()

                usersOfGroups = _.concat(usersOfGroups, agentsAndAdmins)

                var onlineUsernames = _.map(sortedUserList, function (u) {
                  return u.user.username
                })
                onlineUsernames = _.flattenDeep(onlineUsernames)

                var sortedUsernames = _.chain(usersOfGroups)
                  .flattenDeep()
                  .map(function (u) {
                    return u.user.username
                  })
                  .value()

                var actual = _.intersection(onlineUsernames, sortedUsernames)

                usersOfGroups = _.chain(usersOfGroups)
                  .flattenDeep()
                  .filter(function (i) {
                    return actual.indexOf(i.user.username) !== -1
                  })
                  .uniqBy(function (i) {
                    return i.user._id
                  })
                  .value()

                var sortedKeys = _.map(usersOfGroups, function (m) {
                  return m.user.username
                })

                var obj = _.zipObject(sortedKeys, usersOfGroups)

                socket.emit('updateUsers', obj)
              }
            })
          }
        }
      })
    }
  })
  // utils.sendToAllConnectedClients(io, 'updateUsers', sortedUserList)
}

function updateOnlineBubbles () {
  const sortedUserList = _.fromPairs(
    _.sortBy(_.toPairs(sharedVars.usersOnline), function (o) {
      return o[0]
    })
  )
  const sortedIdleList = _.fromPairs(
    _.sortBy(_.toPairs(sharedVars.idleUsers), function (o) {
      return o[0]
    })
  )

  utils.sendToAllConnectedClients(io, socketEventConst.UI_ONLINE_STATUS_UPDATE, {
    sortedUserList: sortedUserList,
    sortedIdleList: sortedIdleList
  })
}

events.updateOnlineBubbles = function (socket) {
  socket.on(socketEventConst.UI_ONLINE_STATUS_UPDATE, function () {
    updateOnlineBubbles()
  })
}

function updateConversationsNotifications () {
  _.each(io.sockets.sockets, function (socket) {
    if (!socket.request && !socket.request.user) {
      return
    }

    var userId = socket.request.user._id
    var messageSchema = require('../models/chat/message')
    var conversationSchema = require('../models/chat/conversation')
    conversationSchema.getConversationsWithLimit(userId, 10, function (err, conversations) {
      if (err) {
        winston.warn(err.message)
        return false
      }

      var convos = []

      async.eachSeries(
        conversations,
        function (convo, done) {
          var c = convo.toObject()

          var userMeta =
            convo.userMeta[
              _.findIndex(convo.userMeta, function (item) {
                return item.userId.toString() === userId.toString()
              })
            ]
          if (!_.isUndefined(userMeta) && !_.isUndefined(userMeta.deletedAt) && userMeta.deletedAt > convo.updatedAt) {
            return done()
          }

          messageSchema.getMostRecentMessage(c._id, function (err, rm) {
            if (err) return done(err)

            _.each(c.participants, function (p) {
              if (p._id.toString() !== userId.toString()) {
                c.partner = p
              }
            })

            rm = _.first(rm)

            if (!_.isUndefined(rm)) {
              if (!c.partner || !rm.owner) return done()

              if (String(c.partner._id) === String(rm.owner._id)) {
                c.recentMessage = c.partner.fullname + ': ' + rm.body
              } else {
                c.recentMessage = 'You: ' + rm.body
              }
            } else {
              c.recentMessage = 'New Conversation'
            }

            convos.push(c)

            return done()
          })
        },
        function (err) {
          if (err) return false
          return utils.sendToSelf(socket, 'updateConversationsNotifications', {
            conversations: convos
          })
        }
      )
    })
  })
}

events.updateConversationsNotifications = function (socket) {
  socket.on('updateConversationsNotifications', function () {
    updateConversationsNotifications(socket)
  })
}

function spawnOpenChatWindows (socket) {
  var loggedInAccountId = socket.request.user._id
  var userSchema = require('../models/user')
  var conversationSchema = require('../models/chat/conversation')
  userSchema.getUser(loggedInAccountId, function (err, user) {
    if (err) return true

    async.eachSeries(user.preferences.openChatWindows, function (convoId, done) {
      var partner = null
      conversationSchema.getConversation(convoId, function (err, conversation) {
        if (err || !conversation) return done()
        _.each(conversation.participants, function (i) {
          if (i._id.toString() !== loggedInAccountId.toString()) {
            partner = i.toObject()
            return partner
          }
        })

        if (partner === null) return done()

        delete partner.password
        delete partner.resetPassHash
        delete partner.resetPassExpire
        delete partner.accessToken
        delete partner.iOSDeviceTokens
        delete partner.deleted

        utils.sendToSelf(socket, 'spawnChatWindow', partner)

        return done()
      })
    })
  })
}

events.getOpenChatWindows = function (socket) {
  socket.on('getOpenChatWindows', function () {
    spawnOpenChatWindows(socket)
  })
}

events.spawnChatWindow = function (socket) {
  socket.on('spawnChatWindow', function (userId) {
    // Get user
    var userSchema = require('../models/user')
    userSchema.getUser(userId, function (err, user) {
      if (err) return true
      if (user !== null) {
        var u = user.toObject()
        delete u.password
        delete u.resetPassHash
        delete u.resetPassExpire
        delete u.accessToken
        delete u.iOSDeviceTokens
        delete u.deleted

        utils.sendToSelf(socket, 'spawnChatWindow', u)
      }
    })
  })
}

events.saveChatWindow = function (socket) {
  socket.on('saveChatWindow', function (data) {
    var userId = data.userId
    var convoId = data.convoId
    var remove = data.remove

    var userSchema = require('../models/user')
    userSchema.getUser(userId, function (err, user) {
      if (err) return true
      if (user !== null) {
        if (remove) {
          user.removeOpenChatWindow(convoId)
        } else {
          user.addOpenChatWindow(convoId)
        }
      }
    })
  })
}

events.onChatMessage = function (socket) {
  socket.on(socketEventConst.MESSAGES_SEND, function (data) {
    const to = data.to
    const from = data.from

    const User = require('../models/user')

    data.message.owner = {
      _id: data.message.owner._id,
      email: data.message.owner.email,
      username: data.message.owner.username,
      fullname: data.message.owner.fullname,
      image: data.message.owner.image,
      title: data.message.owner.title,
      lastOnline: data.message.owner.lastOnline,
      id: data.message.owner._id
    }

    async.parallel(
      [
        function (next) {
          User.getUser(to, function (err, toUser) {
            if (err) return next(err)
            if (!toUser) return next('User Not Found!')

            // Strip
            data.toUser = {
              _id: toUser._id,
              email: toUser.email,
              username: toUser.username,
              fullname: toUser.fullname,
              image: toUser.image,
              title: toUser.title,
              lastOnline: toUser.lastOnline,
              id: toUser._id
            }

            return next()
          })
        },
        function (next) {
          User.getUser(from, function (err, fromUser) {
            if (err) return next(err)
            if (!fromUser) return next('User Not Found')

            // Strip
            data.fromUser = {
              _id: fromUser._id,
              email: fromUser.email,
              username: fromUser.username,
              fullname: fromUser.fullname,
              image: fromUser.image,
              title: fromUser.title,
              lastOnline: fromUser.lastOnline,
              id: fromUser._id
            }

            return next()
          })
        }
      ],
      function (err) {
        if (err) return utils.sendToSelf(socket, socketEventConst.MESSAGES_UI_RECEIVE, { message: err })

        utils.sendToUser(
          sharedVars.sockets,
          sharedVars.usersOnline,
          data.toUser.username,
          socketEventConst.MESSAGES_UI_RECEIVE,
          data
        )

        utils.sendToUser(
          sharedVars.sockets,
          sharedVars.usersOnline,
          data.fromUser.username,
          socketEventConst.MESSAGES_UI_RECEIVE,
          data
        )
      }
    )
  })
}

events.onChatTyping = function (socket) {
  socket.on(socketEventConst.MESSAGES_USER_TYPING, function (data) {
    const to = data.to
    const from = data.from

    let user = null
    let fromUser = null

    _.find(sharedVars.usersOnline, function (v) {
      if (String(v.user._id) === String(to)) {
        user = v.user
      }

      if (String(v.user._id) === String(from)) {
        fromUser = v.user
      }
    })

    if (_.isNull(user) || _.isNull(fromUser)) {
      return
    }

    data.toUser = user
    data.fromUser = fromUser

    utils.sendToUser(
      sharedVars.sockets,
      sharedVars.usersOnline,
      user.username,
      socketEventConst.MESSAGES_UI_USER_TYPING,
      data
    )
  })
}

events.onChatStopTyping = function (socket) {
  socket.on(socketEventConst.MESSAGES_USER_STOP_TYPING, function (data) {
    const to = data.to
    let user = null

    _.find(sharedVars.usersOnline, function (v) {
      if (String(v.user._id) === String(to)) {
        user = v.user
      }
    })

    if (_.isNull(user)) {
      return
    }

    data.toUser = user

    utils.sendToUser(
      sharedVars.sockets,
      sharedVars.usersOnline,
      user.username,
      socketEventConst.MESSAGES_UI_USER_STOP_TYPING,
      data
    )
  })
}

function joinChatServer (socket) {
  const user = socket.request.user
  let exists = false
  if (sharedVars.usersOnline.hasOwnProperty(user.username.toLowerCase())) {
    exists = true
  }

  if (!exists) {
    if (user.username.length !== 0) {
      sharedVars.usersOnline[user.username] = {
        sockets: [socket.id],
        user: user
      }
      // sortedUserList = sharedUtils.sortByKeys(sharedVars.usersOnline)

      utils.sendToSelf(socket, 'joinSuccessfully')
      // utils.sendToAllConnectedClients(io, 'updateUsers', sortedUserList)
      sharedVars.sockets.push(socket)

      spawnOpenChatWindows(socket, user._id)
    }
  } else {
    sharedVars.usersOnline[user.username].sockets.push(socket.id)
    utils.sendToSelf(socket, 'joinSuccessfully')

    // sortedUserList = sharedUtils.sortByKeys(sharedVars.usersOnline)
    // utils.sendToAllConnectedClients(io, 'updateUsers', sortedUserList)
    sharedVars.sockets.push(socket)

    spawnOpenChatWindows(socket, user._id)
  }

  updateOnlineBubbles()
}

events.onDisconnect = function (socket) {
  socket.on('disconnect', function (reason) {
    const user = socket.request.user

    if (!_.isUndefined(sharedVars.usersOnline[user.username])) {
      const userSockets = sharedVars.usersOnline[user.username].sockets

      if (_.size(userSockets) < 2) {
        delete sharedVars.usersOnline[user.username]
      } else {
        sharedVars.usersOnline[user.username].sockets = _.without(userSockets, socket.id)
      }

      const o = _.findKey(sharedVars.sockets, { id: socket.id })
      sharedVars.sockets = _.without(sharedVars.sockets, o)
    }

    if (!_.isUndefined(sharedVars.idleUsers[user.username])) {
      const idleSockets = sharedVars.idleUsers[user.username].sockets

      if (_.size(idleSockets) < 2) {
        delete sharedVars.idleUsers[user.username]
      } else {
        sharedVars.idleUsers[user.username].sockets = _.without(idleSockets, socket.id)
      }

      const i = _.findKey(sharedVars.sockets, { id: socket.id })
      sharedVars.sockets = _.without(sharedVars.sockets, i)
    }

    // Save lastOnline Time
    userSchema.getUser(user._id, function (err, u) {
      if (!err && u) {
        u.lastOnline = new Date()

        u.save()
      }
    })

    // updateOnlineBubbles()

    if (reason === 'transport error') {
      reason = 'client terminated'
    }

    winston.debug('User disconnected (' + reason + '): ' + user.username + ' - ' + socket.id)
  })
}

module.exports = {
  events: events,
  eventLoop: eventLoop,
  register: register
}
