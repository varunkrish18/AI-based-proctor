async function testWandbox() {
  try {
    const res = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler: 'openjdk-jdk-21+35',
        code: 'import java.util.Scanner;\nclass Solution { public static void main(String[] args) { Scanner sc = new Scanner(System.in); while (sc.hasNextLine()) { System.out.println(sc.nextLine()); } } }',
        stdin: '11 15\n9'
      })
    });
    console.log('Wandbox status:', res.status);
    const data = await res.json();
    console.log('Wandbox data:', data);
  } catch (e) {
    console.error(e);
  }
}
testWandbox();
