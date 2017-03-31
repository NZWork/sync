// OT
var Changeset = ot.Changeset
var engine = new diff_match_patch
var his = ""
var seq = 0
var ver = 0
var otLock = false

// WS
var conn = null
var target = "ws://" + location.host + "/sync"
var uid = 0

// Switcher
var send = 0
var lastMsg = 0
var didClose = false
var typing = false

const OP_RETAIN = 0
const OP_INSERT = 1
const OP_DELETE = 2


const OT_MSG = 0
const ACK_MSG = 1
const FORCE_SYNC_MSG = 2

Object.prototype.getName = function() {
    var funcNameRegex = /function (.{1,})\(/
    var results = (funcNameRegex).exec((this).constructor.toString())
    return (results && results.length > 1) ? results[1] : ""
}

$(document).ready(function(){
    $('#main').on('keyup', function() {
        console.log('typed')
        sync()
    });
})


//  Change 转换为 一个 JSON
function changeToJSON(change) {
    var data = new Object()
    var ops = new Object()
    ops.op = new Array()
    var shouldSend = false
    var last = change.length - 1
    for (var i = 0; i < change.length; i++) {
        var op = change[i].getName()

        if (op == 'Retain') {
            if (i == last) { // 最后一个retain扔掉
                continue
            }
        } else {
            shouldSend = true
        }

        switch (op) {
            case 'Retain':
                change[i]['type'] = OP_RETAIN
                break
            case 'Skip':
                change[i]['type'] = OP_DELETE
                break
            case 'Insert':
                change[i]['type'] = OP_INSERT
                break
            default:
        }
        ops.op.push(change[i])
    }
    if (shouldSend) {

        ops.adden = change.addendum
        ops.inputLength = change.inputLength
        ops.outputLength = change.outputLength
        ops.removen = change.removendum

        seq++
        data['type'] = OT_MSG
        data['seq'] = seq
        data['uid'] = uid
        data['ver'] = ver
        data['ops'] = ops
        return JSON.stringify(data)
    }
}

function JSONToChange(json) {
    var ops = []
    if (json == "") {
        return
    }

    data = JSON.parse(json)

    let obj = $('#main')
    let pos = getCaretPosition('main')
    let cursorDrift = false

    if (data['type'] == ACK_MSG) {
        ver = data.ver
        return
    }

    if (data['type'] == FORCE_SYNC_MSG) {
        console.log('force sync')
        // clean all the content
        his = ''
        obj.val('')
    }

    for (var i = 0; i < data.ops.op.length; i++) {
        var current = data.ops.op[i]

        switch (current['type']) {
            case OP_RETAIN:
                ops.push(new ot.Retain(current.length))
                if (current.length < pos) {
                    console.log('drift')
                    cursorDrift = true
                }
                break
            case OP_INSERT:
                ops.push(new ot.Insert(current.length))
                break;
            case OP_DELETE:
                ops.push(new ot.Skip(current.length))
                break;
            default:
        }
    }

    var change = new ot.Changeset(ops)
    change.addendum = data.ops.adden
    change.removendum = data.ops.removen
    change.inputLength = data.ops.inputLength
    change.outputLength = data.ops.outputLength


    let text = obj.val()
    his = change.apply(text)

    if (cursorDrift) {
        pos += change.addendum.length
    }

    ver = data.ver
    return pos
}

function sync() {
    let text = $('#main').val()
    let diff = engine.diff_main(his, text)
    if (diff.length == 1 && diff[0][0] == 0) { // 移动，选择
        return
    }
    let change = Changeset.fromDiff(diff)
    // console.log(change)
    let s = changeToJSON(change)
    if (s != null) {
        sendMsg(s)
        his = text
    }
}

function sendMsg(msg) {
    console.log("send: " + msg)
    // send = Date.now()
    conn.send(msg)
}

function connect() {
    let token = $('#token').val()
    if (token.length == 0) {
        alert("token invalid")
        return
    }
    uid = Math.ceil(Math.random() * 1000)

    conn = new WebSocket(target + "?token=" + token + '&uid=' + uid)
    console.log("connect with sync")
    conn.onopen = function() {
        console.log("connected to sync ")
    }
    conn.onclose = function(e) {
        didClose = true
        console.log("connection closed (" + e.code + ")")
    }

    conn.onmessage = function(e) {
        console.log('current content: ' + $('#main').val())
        let data = e.data
        console.log('received ' + data)
        let modedPos = JSONToChange(e.data)
        if (modedPos == null) {
            return
        }
        $('#main').val(his)
        setCaretPosition('main', modedPos)
    }

    conn.onclose = function() {
        console.log('closed')
        $('#main').attr('readonly', 'readonly')
    }

    $('#cb').attr("disabled", true)
    $('#db').attr("disabled", false)
    $('#main').attr("readonly", false)
}


function disconnect() {
    didClose = true
    conn.close()
    $('#cb').attr("disabled", false)
    $('#db').attr("disabled", true)
    $('#main').attr("readonly", true)
}