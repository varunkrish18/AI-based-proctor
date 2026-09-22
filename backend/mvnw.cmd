@REM ----------------------------------------------------------------------------
@REM Maven Wrapper Batch Script
@REM ----------------------------------------------------------------------------

@IF "%DEBUG%" == "" @ECHO OFF

@REM Find maven executable
IF EXIST "%USERPROFILE%\.maven\apache-maven-3.9.9\bin\mvn.cmd" (
    SET "MAVEN_CMD=%USERPROFILE%\.maven\apache-maven-3.9.9\bin\mvn.cmd"
) ELSE (
    SET "MAVEN_CMD=mvn"
)

call "%MAVEN_CMD%" %*
