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
 *  Updated:    1/20/19 4:46 PM
 *  Copyright (c) 2014-2019. All rights reserved.
 */

import { all } from 'redux-saga/effects'
import CommonSaga from './common'
import DashboardSaga from './dashboard'
import SettingsSaga from './settings'
import TicketSaga from './tickets'
import AccountSaga from './accounts'
import GroupSaga from './groups'
import TeamSaga from './teams'
import DepartmentSaga from './departments'
import NoticeSage from './notices'
import SearchSaga from './search'
import MessagesSaga from './messages'
import ReportsSaga from './reports'

export default function * IndexSagas () {
  yield all([
    CommonSaga(),
    DashboardSaga(),
    TicketSaga(),
    SettingsSaga(),
    AccountSaga(),
    GroupSaga(),
    TeamSaga(),
    DepartmentSaga(),
    NoticeSage(),
    SearchSaga(),
    MessagesSaga(),
    ReportsSaga()
  ])
}
