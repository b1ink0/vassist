import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.InsnNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarInputStream;
import java.util.jar.JarOutputStream;

/**
 * Patches litertlm-android AARs whose sendMessageAsync flow closure calls the
 * synthetic kotlinx.coroutines.channels.SendChannel.close$default - a symbol
 * no released kotlinx-coroutines provides (the AAR was compiled with a
 * toolchain that emitted it), causing NoSuchMethodError when a generation
 * completes. Replaces each occurrence with the equivalent direct
 * ProducerScope.close(cause) interface call, which exists in every version.
 *
 * Operates directly on the AAR (patches the embedded classes.jar).
 *
 * Usage: java PatchLiteRt <in.aar> <out.aar>
 */
public class PatchLiteRt {
    static int totalPatched = 0;

    public static void main(String[] args) throws Exception {
        Path in = Path.of(args[0]);
        Path out = Path.of(args[1]);

        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (JarFile jar = new JarFile(in.toFile())) {
            var e = jar.entries();
            while (e.hasMoreElements()) {
                var je = e.nextElement();
                if (je.isDirectory()) continue;
                byte[] data = jar.getInputStream(je).readAllBytes();
                if (je.getName().endsWith(".class")) {
                    data = transform(data, je.getName());
                } else if (je.getName().endsWith(".jar")) {
                    // Nested jar (AARs embed classes.jar) - patch its classes too
                    data = transformNestedJar(data, je.getName());
                }
                entries.put(je.getName(), data);
            }
        }
        try (JarOutputStream jos = new JarOutputStream(Files.newOutputStream(out))) {
            for (var en : entries.entrySet()) {
                jos.putNextEntry(new JarEntry(en.getKey()));
                jos.write(en.getValue());
                jos.closeEntry();
            }
        }
        System.out.println("[PatchLiteRt] patched call sites: " + totalPatched);
        if (totalPatched == 0) throw new IllegalStateException("no close$default sites found - pattern mismatch");
    }

    /** Patch every .class inside a jar embedded as raw bytes (e.g. AAR's classes.jar). */
    static byte[] transformNestedJar(byte[] nested, String name) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (JarInputStream jin = new JarInputStream(new java.io.ByteArrayInputStream(nested))) {
            JarEntry je;
            while ((je = jin.getNextJarEntry()) != null) {
                if (je.isDirectory()) continue;
                byte[] data = jin.readAllBytes();
                if (je.getName().endsWith(".class")) {
                    data = transform(data, name + "!" + je.getName());
                }
                entries.put(je.getName(), data);
            }
        }
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        try (JarOutputStream jos = new JarOutputStream(bos)) {
            for (var en : entries.entrySet()) {
                jos.putNextEntry(new JarEntry(en.getKey()));
                jos.write(en.getValue());
                jos.closeEntry();
            }
        }
        System.out.println("[PatchLiteRt] processed nested jar: " + name);
        return bos.toByteArray();
    }

    static byte[] transform(byte[] cls, String name) {
        ClassNode node = new ClassNode();
        new ClassReader(cls).accept(node, 0);

        for (MethodNode mn : node.methods) {
            AbstractInsnNode insn = mn.instructions.getFirst();
            while (insn != null) {
                if (insn instanceof MethodInsnNode m
                        && m.itf
                        && m.owner.equals("kotlinx/coroutines/channels/SendChannel")
                        && m.name.equals("close$default")
                        && m.desc.equals("(Lkotlinx/coroutines/channels/SendChannel;Ljava/lang/Throwable;ILjava/lang/Object;)Z")) {

                    // Stack here: [ProducerScope-ref]  then  NULL(mmask-arg), ICONST_1(mask), NULL(marker)
                    AbstractInsnNode n1 = m.getPrevious();          // expected NULL (marker)
                    AbstractInsnNode n2 = n1 != null ? n1.getPrevious() : null; // expected ICONST_1
                    AbstractInsnNode n3 = n2 != null ? n2.getPrevious() : null; // expected NULL (cause)
                    boolean ok = n1 != null && n2 != null && n3 != null
                            && n1 instanceof InsnNode i1 && i1.getOpcode() == org.objectweb.asm.Opcodes.ACONST_NULL
                            && n2 instanceof InsnNode i2 && i2.getOpcode() == org.objectweb.asm.Opcodes.ICONST_1
                            && n3 instanceof InsnNode i3 && i3.getOpcode() == org.objectweb.asm.Opcodes.ACONST_NULL;

                    if (!ok) throw new IllegalStateException(
                            "Unexpected pattern before close$default in " + name + "." + mn.name);

                    mn.instructions.remove(n1);
                    mn.instructions.remove(n2);
                    // keep n3 (ACONST_NULL) as the cause argument

                    MethodInsnNode direct = new MethodInsnNode(
                            org.objectweb.asm.Opcodes.INVOKEINTERFACE,
                            "kotlinx/coroutines/channels/ProducerScope",
                            "close",
                            "(Ljava/lang/Throwable;)Z",
                            true);
                    mn.instructions.insert(n3, direct);
                    mn.instructions.remove(insn);

                    totalPatched++;
                    System.out.println("[PatchLiteRt] fixed " + name + "." + mn.name);
                    insn = direct;
                    continue;
                }
                insn = insn.getNext();
            }
        }

        ClassWriter w = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        node.accept(w);
        return w.toByteArray();
    }
}
