' Arranca o bot sem janela, com log em logs\bot.log
' Usado pelo Agendador de Tarefas do Windows (ao iniciar sessao).
'
' Opcional: define NODE_EXE com o caminho completo do node.exe
' se o Node nao estiver no PATH.

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

project = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = project

If Not fso.FolderExists(project & "\logs") Then
  fso.CreateFolder project & "\logs"
End If

node = sh.ExpandEnvironmentStrings("%NODE_EXE%")
If node = "%NODE_EXE%" Or Not fso.FileExists(node) Then
  node = "node"
Else
  node = """" & node & """"
End If

cmd = "cmd /c " & node & " src\index.js >> logs\bot.log 2>&1"
sh.Run cmd, 0, False
