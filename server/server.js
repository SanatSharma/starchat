"use strict";
/*
enum Events {
    CONNECTION = "Connection",
    GROUPMESSAGE: "groupMessage",
    SINGLEMESSAGE: "singleMessage",
    DISCONNECTION = "Disconnect",
}

enum Profile {
    STARCHAT = "starchat",
}


enum Group {
    TEACHER = "teacher",
    CENTER = "center"
}

enum Message {
    PROFILE = 'profile',
    TYPE = 'type',
    SESSIONID = 'SessionID',
    GROUP = 'group',
    WSID = "wsID",
    DATA = "data",
    NAME = "name"
}

Teacher:
        Initiate ws-session with the following connection
        {
            profile: Profile.STARCHAT,
            type: Event.CONNECTION,
            group: Group.TEACHER,
            name: <studio name>
            SessionID: <session id>
        }

        Add to Websockets map, teacher connections
        If session exists in Connections list, update the wsID of teacher for that connection
        Else create the connection for that session

Classroom:
        Receive Message from Classrooms wanting to join
        {
            profile: Profile.STARCHAT,
            type: EVENT.CONNECTION,
            group: Group.CENTER,
            name: <center name>
            SessionID: <session id>
        }
        Add to websockets map, classrooms map, classroomWSids for that session connection
        
Teacher:
        Message:
            {
                profile: Profile.STARCHAT,
                type: Event.GROUPMESSAGE/SINGLEMESSAGE,
                group: Group.TEACHER,
                data: <message data>,
                SessionID: <session id>
            }

        Send the following to the classrooms:
            {
                type: Event.GROUPMESSAGE/SINGLEMESSAGE,
                data: <message data>
            }
  
  Classroom:
      Message:
            {
                profile: Profile.STARCHAT,
                type: Event.GROUPMESSAGE/SINGLEMESSAGE,
                group: Group.CENTER,
                data: <message data>,
                SessionID: <session id>
            }

        Send the following to the teacher:
            {
                type: Event.GROUPMESSAGE/SINGLEMESSAGE,
                data: <message data>
            }
  
        Close Connection:

          on Classroom disconnection:
            1) Close classroom websocket connection and delete from ws dictionary
            2) Remove from list of classroom connections for center
          
          on Teacher disconnection:
            1) Close classroom websocket connections and delete from ws dictionary
            2) Delete connection object from Connections list
            3) Close Teacher Connection and delete from ws dictionary

*/
exports.__esModule = true;
var Events;
(function (Events) {
    Events["CONNECTION"] = "Connection";
    Events["GROUPMESSAGE"] = "groupMessage";
    Events["SINGLEMESSAGE"] = "singleMessage";
    Events["DISCONNECTION"] = "Disconnect";
    Events["CENTERREMOVE"] = "centerRemove";
})(Events || (Events = {}));
var Profile;
(function (Profile) {
    Profile["STARCHAT"] = "starchat";
})(Profile || (Profile = {}));
var Group;
(function (Group) {
    Group["TEACHER"] = "teacher";
    Group["CENTER"] = "center";
})(Group || (Group = {}));
var Message;
(function (Message) {
    Message["PROFILE"] = "profile";
    Message["TYPE"] = "type";
    Message["SESSIONID"] = "SessionID";
    Message["GROUP"] = "group";
    Message["WSID"] = "wsID";
    Message["DATA"] = "data";
    Message["STUDENT"] = "student";
    Message["NAME"] = "name";
    Message["ID"] = "id";
})(Message || (Message = {}));
var Teacher = /** @class */ (function () {
    function Teacher(wsID, conn, name) {
        this.wsID = wsID;
        this.conn = conn;
        this.name = name;
    }
    return Teacher;
}());
var Classroom = /** @class */ (function () {
    function Classroom(wsID, conn, name) {
        this.wsID = wsID;
        this.conn = conn;
        this.name = name;
    }
    return Classroom;
}());
var Connection = /** @class */ (function () {
    function Connection(SessionID, wsID) {
        this.SessionID = SessionID;
        this.wsID = wsID;
        this.classroomWsID = [];
    }
    return Connection;
}());
var fs = require("fs");
var util = require("util");
var log_file = fs.createWriteStream(__dirname + '/debug.log', { flags: 'w' });
var log_stdout = process.stdout;
console.log = function (d) {
    d = new Date().toString() + " | " + d;
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};
var WebSocket = require("ws");
var connections = {};
var websockets = {}; // websocket mapping
var teachers = {};
var classrooms = {};
var port = 4000;
var idCounter = 0;
var wss = new WebSocket.Server({ port: port });
wss.on('connection', function connection(ws) {
    ws.on('close', function () {
        try {
            console.log("Handling Disconnection");
            HandleDisconnection(ws);
        }
        catch (e) {
            console.error(e);
        }
    });
    ws.on('message', function (message) {
        try {
            var json = JSON.parse(message);
            HandleMessage(ws, json);
        }
        catch (e) {
            console.error("Exception: " + e);
        }
    });
    ws.on("error", function (error) {
        console.error('WebSocket Error: ' + error);
    });
});
function assert(condition, message) {
    if (!condition) {
        message = message || "Assertion failed";
        if (typeof Error !== "undefined") {
            throw new Error(message);
        }
        throw message; // Fallback
    }
}
function HandleDisconnection(ws) {
    if (ws.id in teachers) {
        console.log("Teacher disconnection");
        var teacherWsID = ws.id;
        var Teacher = teachers[teacherWsID];
        var conn = Teacher.conn;
        console.log("Closing Session: " + conn.SessionID);
        for (var _i = 0, _a = conn.classroomWsID; _i < _a.length; _i++) {
            var wsID = _a[_i];
            websockets[wsID].close();
            delete websockets[wsID];
            delete classrooms[wsID];
        }
        delete teachers[conn.wsID];
        delete websockets[conn.wsID];
        delete connections[conn.SessionID];
    }
    else if (ws.id in classrooms) {
        console.log("Removing Classroom connection. Number of Connections is " + (Object.keys(classrooms).length - 1));
        var classroomWsID = ws.id;
        var classroom = classrooms[classroomWsID];
        var conn = classroom.conn;
        var teacherWsID = conn.wsID;
        var classroomName = classroom.name;
        var index = -1;
        for (var i = 0; i < conn.classroomWsID.length; i++) {
            if (classroomWsID === conn.classroomWsID[i]) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw "Classroom not in Connection Classroom list";
        }
        else {
            conn.classroomWsID.splice(index, 1);
        }
        delete classrooms[classroomWsID];
        delete websockets[classroomWsID];
        SendDisconnectionMessage(teacherWsID, classroomWsID, classroomName);
    }
    else {
        throw "Member neither in teacher nor classroom connections";
    }
}
function HandleMessage(ws, json) {
    assert(Message.PROFILE in json, "Profile non existent in message");
    if (json[Message.PROFILE] === Profile.STARCHAT) {
        if (json[Message.TYPE] == Events.CONNECTION) {
            ws.id = idCounter++;
            if (json[Message.GROUP] === Group.TEACHER) {
                AddTeacher(ws, json);
            }
            else if (json[Message.GROUP] === Group.CENTER) {
                AddClassroom(ws, json);
            }
        }
        else if (json[Message.TYPE] == Events.GROUPMESSAGE || json[Message.TYPE] == Events.SINGLEMESSAGE) {
            assert(ws.id in teachers || ws.id in classrooms, "Illegal Entity sending message. Do not send!");
            console.log("Message: " + JSON.stringify(json));
            SendMessage(ws.id, json);
        }
    }
}
function AddTeacher(ws, json) {
    var teacherWsID = ws.id;
    var SessionID = json[Message.SESSIONID];
    console.log("Adding new Teacher and connection " + teacherWsID);
    if (SessionID in connections) {
        console.log("Session connection already exists");
        var conn = connections[SessionID];
        if (conn.wsID in teachers) {
            throw "Teacher connection already exists. Rejecting Teacher Connection!";
        }
        conn.wsID = teacherWsID;
    }
    else {
        var conn = new Connection(json[Message.SESSIONID], teacherWsID);
        connections[SessionID] = conn;
        console.log("Number of Connections: " + Object.keys(connections).length);
    }
    var teacher = new Teacher(teacherWsID, conn, json[Message.NAME]);
    teachers[teacherWsID] = teacher; // Add to Teachers dict
    websockets[teacherWsID] = ws; // Add to websockets dict
}
function AddClassroom(ws, json) {
    var classroomWsID = ws.id;
    console.log("Adding new classroom " + classroomWsID + ". Number of classrooms " + (Object.keys(classrooms).length + 1));
    var SessionID = json[Message.SESSIONID];
    assert(SessionID in connections, "Could not add Classroom. Connection channel non existent!");
    var conn = connections[SessionID];
    conn.classroomWsID.push(classroomWsID); // Add to channel's classroom list
    console.log("Added classroom to connection list. " + conn.classroomWsID);
    var classroom = new Classroom(classroomWsID, conn, json[Message.NAME]);
    classrooms[classroomWsID] = classroom; // Add to classrooms dict
    websockets[classroomWsID] = ws; // Add to websockets dict
    SendConnectionMessage(conn.wsID, classroomWsID, classroom.name);
}
function SendMessage(wsID, json) {
    if (wsID in teachers) {
        var teacher = teachers[wsID];
        var conn = teacher.conn;
        if (json[Message.TYPE] == Events.GROUPMESSAGE) {
            for (var _i = 0, _a = conn.classroomWsID; _i < _a.length; _i++) {
                var wsID = _a[_i];
                var ws = websockets[wsID];
                ws.send(JSON.stringify({
                    type: json[Message.TYPE],
                    data: json[Message.DATA]
                }));
            }
        }
        else if (json[Message.TYPE] == Events.SINGLEMESSAGE) {
            var classroomWsID = json[Message.ID];
            assert(classroomWsID in websockets, "Center Connection not present anymore!");
            var ws = websockets[classroomWsID];
            ws.send(JSON.stringify({
                type: json[Message.TYPE],
                data: json[Message.DATA]
            }));
        }
    }
    else {
        var classroom = classrooms[wsID];
        var conn = classroom.conn;
        var teacherWs = websockets[conn.wsID];
        // if message is a Group Message, center must send the Student name in the message
        if (json[Message.TYPE] == Events.GROUPMESSAGE)
            teacherWs.send(JSON.stringify({
                type: json[Message.TYPE],
                data: json[Message.DATA],
                student: json[Message.STUDENT],
                id: wsID
            }));
        else
            teacherWs.send(JSON.stringify({
                type: json[Message.TYPE],
                data: json[Message.DATA],
                id: wsID
            }));
    }
}
function SendDisconnectionMessage(teacherWsID, classroomWsID, classroomName) {
    var teacherWs = websockets[teacherWsID];
    teacherWs.send(JSON.stringify({
        type: Events.CENTERREMOVE,
        id: classroomWsID,
        name: classroomName
    }));
}
function SendConnectionMessage(teacherWsID, classroomWsID, classroomName) {
    var teacherWs = websockets[teacherWsID];
    teacherWs.send(JSON.stringify({
        type: Events.CONNECTION,
        id: classroomWsID,
        name: classroomName
    }));
}
