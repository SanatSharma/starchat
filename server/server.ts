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

enum Events {
    CONNECTION = "Connection",
    GROUPMESSAGE = "groupMessage",
    SINGLEMESSAGE = "singleMessage",
    DISCONNECTION = "Disconnect",
    CENTERREMOVE = "centerRemove"
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
    STUDENT = "student",
    NAME = "name",
    ID = "id"
}

class Teacher {
    wsID: number; // websocket id
    conn: Connection;
    name: string;

    constructor (wsID:number, conn:Connection, name:string) {
        this.wsID = wsID;
        this.conn = conn;
        this.name = name;
    }

}

class Classroom {
    wsID: number; // websocket id
    conn: Connection;
    name: string;

    constructor (wsID:number, conn:Connection, name:string) {
        this.wsID = wsID;
        this.conn = conn;
        this.name = name
    }
}

class Connection {
    SessionID: number;
    wsID: number; // Websocket id of Teacher attached to this channel
    classroomWsID: number[];

    constructor (SessionID:number, wsID:number) {
        this.SessionID = SessionID;
        this.wsID = wsID;
        this.classroomWsID = [];
    }
}
import * as fs from 'fs';
import * as util from 'util';
var log_file = fs.createWriteStream(__dirname + '/debug.log', {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};

import * as WebSocket from 'ws';
let connections: {[SessionID: number]: Connection} = {};
let websockets: {[wsID:number]: WebSocket;} = {}; // websocket mapping
let teachers: {[wsID:number]: Teacher} = {};
let classrooms: {[wsID:number]: Classroom} = {};
var port: number = 4000;
var idCounter:number = 0;

const wss = new WebSocket.Server({ port: port});

wss.on('connection', function connection(ws: WebSocket) {
    ws.on('close', function(){
        try {
            console.log("Handling Disconnection");
            HandleDisconnection(ws);
        }
        catch (e) {
            console.error(e);
        }
    });

    ws.on('message', function(message) {
        try {
            var json:JSON = JSON.parse(message);
            HandleMessage(ws, json);
        } catch (e) {
            console.error("Exception: " + e);
        }
    });
    
    ws.on("error", function(error) {
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

function HandleDisconnection(ws:WebSocket) {
    if (ws.id in teachers) {
        console.log("Teacher disconnection");
        var teacherWsID = ws.id;
        var Teacher:Teacher = teachers[teacherWsID];
        var conn:Connection = Teacher.conn;
        console.log("Closing Session: " + conn.SessionID);

        for (var wsID of conn.classroomWsID) {
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
        var classroomWsID:number = ws.id;
        var classroom:Classroom = classrooms[classroomWsID];
        var conn = classroom.conn;
        var teacherWsID:number = conn.wsID;
        var classroomName:string = classroom.name;

        var index:number = -1;
        for (let i:number=0; i < conn.classroomWsID.length; i++) {
            if (classroomWsID === conn.classroomWsID[i]) {
                index = i;
                break;
            }   
        }

        if (index === -1) {
            throw "Classroom not in Connection Classroom list";
        } else {
            conn.classroomWsID.splice(index, 1);
        }

        delete classrooms[classroomWsID];
        delete websockets[classroomWsID];

        SendDisconnectionMessage(teacherWsID, classroomWsID, classroomName)
    }
    else {
        throw "Member neither in teacher nor classroom connections";
    }
}


function HandleMessage(ws:WebSocket, json:JSON) {
    assert(Message.PROFILE in json, "Profile non existent in message");
    if (json[Message.PROFILE] === Profile.STARCHAT) {
        if (json[Message.TYPE] == Events.CONNECTION) {
            ws.id = idCounter++;
            if (json[Message.GROUP] === Group.TEACHER) {
                AddTeacher(ws, json);
            }
            else if (json[Message.GROUP] === Group.CENTER) {
                AddClassroom(ws,json);                
            }
        }
        else if (json[Message.TYPE] == Events.GROUPMESSAGE || json[Message.TYPE] == Events.SINGLEMESSAGE) {
            assert(ws.id in teachers || ws.id in classrooms, "Illegal Entity sending message. Do not send!");
            console.log("Message: " + JSON.stringify(json));

            SendMessage(ws.id, json);
        }
    }
}

function AddTeacher (ws: WebSocket, json:JSON) {
    var teacherWsID:number = ws.id;
    var SessionID:number = json[Message.SESSIONID];
    console.log ("Adding new Teacher and connection " + teacherWsID);

    if (SessionID in connections) {
        console.log ("Session connection already exists");
        var conn = connections[SessionID];
        if (conn.wsID in teachers) {
            throw "Teacher connection already exists. Rejecting Teacher Connection!";
        }
        conn.wsID = teacherWsID;
    }
    else {
        var conn:Connection = new Connection (json[Message.SESSIONID], teacherWsID);
        connections[SessionID] = conn;
        console.log ("Number of Connections: " + Object.keys(connections).length);
    }

    var teacher:Teacher = new Teacher (teacherWsID, conn, json[Message.NAME]);
    teachers[teacherWsID] = teacher; // Add to Teachers dict

    websockets[teacherWsID] = ws; // Add to websockets dict
}

function AddClassroom (ws: WebSocket, json:JSON) {
    var classroomWsID:number = ws.id;
    console.log ("Adding new classroom " + classroomWsID + ". Number of classrooms " + (Object.keys(classrooms).length + 1));
    var SessionID = json[Message.SESSIONID];

    assert (SessionID in connections, "Could not add Classroom. Connection channel non existent!");

    var conn:Connection = connections[SessionID];
    conn.classroomWsID.push(classroomWsID); // Add to channel's classroom list

    console.log("Added classroom to connection list. " + conn.classroomWsID);
    
    var classroom:Classroom = new Classroom(classroomWsID, conn, json[Message.NAME]);
    classrooms[classroomWsID] = classroom // Add to classrooms dict

    websockets[classroomWsID] = ws // Add to websockets dict

    SendConnectionMessage(conn.wsID, classroomWsID, classroom.name)
}

function SendMessage (wsID: number, json:JSON) {
    if (wsID in teachers) {
        var teacher:Teacher = teachers[wsID];
        var conn:Connection = teacher.conn;
        
        if (json[Message.TYPE] == Events.GROUPMESSAGE) {
            for (var wsID of conn.classroomWsID) {
                var ws:WebSocket = websockets[wsID];
                ws.send (
                    JSON.stringify ({
                        type: json[Message.TYPE],
                        data: json[Message.DATA]
                    }));
            }    
        }
        else if (json[Message.TYPE] == Events.SINGLEMESSAGE) {
            var classroomWsID:number = json[Message.ID];

            assert (classroomWsID in websockets, "Center Connection not present anymore!");
            var ws:WebSocket = websockets[classroomWsID];
            ws.send (
                JSON.stringify ({
                    type: json[Message.TYPE],
                    data: json[Message.DATA]
                }));
        }

    }
    else {
        var classroom:Classroom = classrooms[wsID];
        var conn:Connection = classroom.conn;

        var teacherWs:WebSocket = websockets[conn.wsID];

        // if message is a Group Message, center must send the Student name in the message
        if (json[Message.TYPE] == Events.GROUPMESSAGE)
            teacherWs.send (
                JSON.stringify ({
                    type: json[Message.TYPE],
                    data: json[Message.DATA],
                    student: json[Message.STUDENT],
                    id: wsID
                }));
        else
            teacherWs.send (
                JSON.stringify ({
                    type: json[Message.TYPE],
                    data: json[Message.DATA],
                    id: wsID
                }));
    }
}

function SendDisconnectionMessage(teacherWsID:number, classroomWsID:number, classroomName:string) {
    var teacherWs:WebSocket = websockets[teacherWsID];
    teacherWs.send (
        JSON.stringify ({
            type: Events.CENTERREMOVE,
            id: classroomWsID,
            name: classroomName
        }));
}

function SendConnectionMessage(teacherWsID:number, classroomWsID:number, classroomName:string) {
    var teacherWs:WebSocket = websockets[teacherWsID];
    teacherWs.send (
        JSON.stringify ({
            type: Events.CONNECTION,
            id: classroomWsID,
            name: classroomName
        }));
}
