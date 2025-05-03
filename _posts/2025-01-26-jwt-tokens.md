# Understanding JWT Tokens: A Practical Introduction with C# Examples
Nowadays, with distributed systems and stateless APIs, it is very important to transmit information securely among parties. 
As one of the most popular standards for that purpose, we have JSON Web Tokens.

In this article, we will discuss the basics of JWT, use cases, and how to work with it in C# using [JwtInspector](https://github.com/engineering87/jwt-inspector).

## What is a JWT?
A JSON Web Token (JWT) is a compact, URL-safe token format used to securely transmit information as a JSON object. 
It is widely used for authentication and information exchange in modern applications.
A JWT consists of three parts:
1. **Header**: Contains metadata about the token, such as the signing algorithm (`HS256` or `RS256`).
2. **Payload**: Contains the claims, which are statements about an entity.
3. **Signature**: Ensures the token’s integrity and authenticity.

These parts are encoded in Base64Url and concatenated with dots (.), resulting in a token that looks like this:

`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`

## Why Use JWT?
JWT is mainly applied in cases involving stateless authentication or the transfer of data in a secured manner. 
Key use scenarios include:

1. **Authenticating**: by issuing a token to the logged-in user on the client to access resources.
2. **Authorization**: encoding user roles and permissions in the token to assess access control,
3. **Data Exchange**: ensuring the integrity and authenticity of data shared by parties.

## Working with JWT in C# Using JwtInspector
The **JwtInspector** library provides a straightforward way to decode and validate JWTs in .NET applications. 
This is an open-source project developed by me, and you can find the package [here](https://www.nuget.org/packages/JwtInspector.Core). 
Below, we’ll demonstrate how to use it.

### Installation
First, add the JwtInspector library to your project via NuGet:
`dotnet add package JwtInspector`

### Decoding a JWT
Let’s start by decoding a JWT to inspect its header and payload:

```csharp
using JwtInspector.Core.Services;

var jwtInspector = new JwtInspectorService();
string token = "<your-jwt-token>";
var claims = jwtInspector.DecodePayloadAsJson(token);
Console.WriteLine(claims);
```

### Validating a JWT
To validate a JWT’s signature and expiration:

```csharp
using JwtInspector.Core.Services;

var jwtInspector = new JwtInspectorService();
string token = "<your-jwt-token>";
string secretKey = "<your-secret-key>";
bool isValid = jwtInspector.ValidateToken(token, secretKey);
Console.WriteLine($"Token valid: {isValid}");
```

### Extracting JWT Parts
You can extract the header, payload, and signature from a JWT token:

```csharp
using JwtInspector.Core.Services;

var jwtInspector = new JwtInspectorService();
string token = "<your-jwt-token>";
var (header, payload, signature) = jwtInspector.ExtractJwtParts(token);
Console.WriteLine($"Header: {header}");
Console.WriteLine($"Payload: {payload}");
Console.WriteLine($"Signature: {signature}");
```

## Benefits of JwtInspector
* **Ease of Use**: The API is intuitive and minimizes boilerplate code.
* **Robust Validation**: It handles common JWT validation checks, such as signature verification and claim checks.
* **Extensibility**: The library can be extended to fit custom validation needs.

## Conclusion
JSON Web Tokens are a significant development tool that allows for secure and fast communication in modern distributed systems. 
Libraries like **JwtInspector** make working with JWTs in.NET a breeze. Be it the building of API, authentication mechanisms, or even a simple exchange of secured data, understanding and effectively utilizing JWT is quintessential for any developer.
