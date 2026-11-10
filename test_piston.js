async function test() {
  const res = await fetch('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'java',
      version: '*',
      files: [{
        name: 'Solution.java',
        content: `import java.util.Scanner;
public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            System.out.println(sc.nextLine());
        }
    }
}`
      }],
      stdin: '11 15\n9'
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
