use strict;
use warnings;

use Test::More 'no_plan';
use Data::Dumper;

BEGIN { use_ok("Recs::Record"); }

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d");

   # Check all the const functions
   is($rec->get_a(), "b", "get_a()");
   is($rec->get_c(), "d", "get_c()");
   is($rec->get_x(), undef, "get_x()");
   is($rec->get('a'), "b", "get('a')");
   is($rec->get('c'), "d", "get('c')");
   is($rec->get('x'), undef, "get('x')");
   ok($rec->exists('a'), "exists('a')");
   ok($rec->exists('c'), "exists('c')");
   ok(!$rec->exists('x'), "exists('x')");
   is_deeply({map { ($_ => 1) } ($rec->keys())}, {"a" => 1, "c" => 1}, "keys hash");
   is_deeply({$rec->as_hash()}, {"a" => "b", "c" => "d"}, "as_hash");

   # try basic setters

   is($rec->set_a('b2'), "b", "set_a('b2')");
   is($rec->get_a(), "b2", "get_a()");

   is($rec->set_x('y'), undef, "set_x('y')");
   is($rec->get_x(), "y", "get_x()");
}

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d");

   is($rec->remove('a'), "b", "remove('a')");

   is_deeply({$rec->as_hash()}, {"c" => "d"}, "as_hash()");
}

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d");

   is($rec->remove('x'), undef, "remove('x')");

   is_deeply({$rec->as_hash()}, {"a" => "b", "c" => "d"}, "as_hash()");
}

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d");

   $rec->rename("a", "a2");

   is_deeply({$rec->as_hash()}, {"a2" => "b", "c" => "d"}, "as_hash()");
}

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d");

   $rec->rename("a", "c");

   is_deeply({$rec->as_hash()}, {"c" => "b"}, "as_hash()");
}

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d");

   $rec->rename("x", "x2");

   is_deeply({$rec->as_hash()}, {"a" => "b", "c" => "d", "x2" => undef}, "as_hash()");
}

{
   my $rec = Recs::Record->new("a" => "b", "c" => "d", "e" => "f", "g" => "h");

   $rec->prune("a", "e", "x");

   is_deeply({$rec->as_hash()}, {"a" => "b", "e" => "f"});
}

{
   my $rec = Recs::Record->new("n" => "2", "s" => "a");
   my $rec2 = Recs::Record->new("n" => "10", "s" => "b");

   is($rec->cmp($rec2, "n"), 1, "lexical (implicit) 2 <=> 10");
   is($rec->cmp($rec2, "n="), 1, "lexical '' 2 <=> 10");
   is($rec->cmp($rec2, "n=lex"), 1, "lexical 'lex' 2 <=> 10");
   is($rec->cmp($rec2, "n=lexical"), 1, "lexical 'lexical' 2 <=> 10");
   is($rec->cmp($rec2, "n=-"), -1, "-lexical '-' 2 <=> 10");
   is($rec->cmp($rec2, "n=-lex"), -1, "-lexical '-lex' 2 <=> 10");
   is($rec->cmp($rec2, "n=-lexical"), -1, "-lexical '-lexical' 2 <=> 10");

   is($rec->cmp($rec2, "n=nat"), -1, "natural 'nat' 2 <=> 10");
   is($rec->cmp($rec2, "n=natural"), -1, "natural 'natural' 2 <=> 10");
   is($rec->cmp($rec2, "n=-nat"), 1, "-natural '-nat' 2 <=> 10");
   is($rec->cmp($rec2, "n=-natural"), 1, "-natural '-natural' 2 <=> 10");

   is($rec->cmp($rec2, "s"), -1, "lexical (implicit) a <=> b");
   is($rec->cmp($rec2, "s="), -1, "lexical '' a <=> b");
   is($rec->cmp($rec2, "s=lex"), -1, "lexical 'lex' a <=> b");
   is($rec->cmp($rec2, "s=lexical"), -1, "lexical 'lexical' a <=> b");
   is($rec->cmp($rec2, "s=-"), 1, "-lexical '-' a <=> b");
   is($rec->cmp($rec2, "s=-lex"), 1, "-lexical '-lex' a <=> b");
   is($rec->cmp($rec2, "s=-lexical"), 1, "-lexical '-lexical' a <=> b");
}

{
   my $rec11 = Recs::Record->new("f1" => "1", "f2" => "1");
   my $rec12 = Recs::Record->new("f1" => "1", "f2" => "2");
   my $rec13 = Recs::Record->new("f1" => "1", "f2" => "3");
   my $rec21 = Recs::Record->new("f1" => "2", "f2" => "1");
   my $rec22 = Recs::Record->new("f1" => "2", "f2" => "2");
   my $rec23 = Recs::Record->new("f1" => "2", "f2" => "3");
   my $rec31 = Recs::Record->new("f1" => "3", "f2" => "1");
   my $rec32 = Recs::Record->new("f1" => "3", "f2" => "2");
   my $rec33 = Recs::Record->new("f1" => "3", "f2" => "3");

   is($rec11->cmp($rec12, "f1"), 0, "rec11 <=> rec12, f1");
   is($rec21->cmp($rec12, "f1"), 1, "rec21 <=> rec12, f1");
   is($rec11->cmp($rec22, "f1"), -1, "rec11 <=> rec22, f1");

   is($rec22->cmp($rec22, "f1", "f2"), 0, "rec22 <=> rec22, f1, f2");

   is($rec22->cmp($rec13, "f1", "f2"), 1, "rec22 <=> rec13, f1, f2");
   is($rec22->cmp($rec31, "f1", "f2"), -1, "rec22 <=> rec31, f1, f2");

   is($rec22->cmp($rec21, "f1", "f2"), 1, "rec22 <=> rec21, f1, f2");
   is($rec22->cmp($rec23, "f1", "f2"), -1, "rec22 <=> rec23, f1, f2");
}

{
   my $rec11 = Recs::Record->new("f1" => "1", "f2" => "1");
   my $rec12 = Recs::Record->new("f1" => "1", "f2" => "2");
   my $rec13 = Recs::Record->new("f1" => "1", "f2" => "3");
   my $rec21 = Recs::Record->new("f1" => "2", "f2" => "1");
   my $rec22 = Recs::Record->new("f1" => "2", "f2" => "2");
   my $rec23 = Recs::Record->new("f1" => "2", "f2" => "3");
   my $rec31 = Recs::Record->new("f1" => "3", "f2" => "1");
   my $rec32 = Recs::Record->new("f1" => "3", "f2" => "2");
   my $rec33 = Recs::Record->new("f1" => "3", "f2" => "3");

   my @sorted = Recs::Record::sort([$rec11, 
                                    $rec12, 
                                    $rec13, 
                                    $rec21, 
                                    $rec22, 
                                    $rec23, 
                                    $rec31, 
                                    $rec32, 
                                    $rec33,], 
                                    qw(f2=-natural f1=natural));

   is_deeply($rec13, shift @sorted, "rec13 sorted correctly");
   is_deeply($rec23, shift @sorted, "rec23 sorted correctly");
   is_deeply($rec33, shift @sorted, "rec33 sorted correctly");

   is_deeply($rec12, shift @sorted, "rec12 sorted correctly");
   is_deeply($rec22, shift @sorted, "rec22 sorted correctly");
   is_deeply($rec32, shift @sorted, "rec32 sorted correctly");

   is_deeply($rec11, shift @sorted, "rec11 sorted correctly");
   is_deeply($rec21, shift @sorted, "rec21 sorted correctly");
   is_deeply($rec31, shift @sorted, "rec31 sorted correctly");
}
